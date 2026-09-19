import { App, Notice, TFile } from 'obsidian';
import { saveAttachment } from '../inbox/media';
import { IncomingMessage } from '../inbox/message';
import { resolveTarget, RoutingTarget } from '../inbox/routing';
import { writeMessage } from '../inbox/writer';
import type MSXDAllInOnePlugin from '../main';
import { isChatAllowed } from '../settings';
import {
	downloadFile,
	getFilePath,
	getUpdates,
	redactToken,
	TelegramApiError,
} from '../telegram/api';
import { ChatRef } from '../telegram/types';
import { parseUpdate } from '../telegram/updates';

/** How long Telegram holds the connection open waiting for something to arrive. */
const POLL_TIMEOUT_SECONDS = 30;
const ERROR_RETRY_MS = 5000;
/** A 409 means another reader holds the queue, which needs a longer breather. */
const CONFLICT_RETRY_MS = 15000;
const MAX_SEEN_CHATS = 20;

export type IntakeStatus =
	| { kind: 'stopped' }
	| { kind: 'listening' }
	| { kind: 'error'; message: string };

/**
 * Long polling loop: asks Telegram for updates, checks them against the
 * allowlist, routes them and writes them into the vault.
 *
 * `requestUrl` cannot be cancelled, so a poll already in flight cannot be
 * aborted when the plugin unloads. Instead every loop carries a generation
 * number and abandons its result if that number moved on. The request itself
 * finishes into nothing, which is also why a restart can meet a 409 from the
 * previous request and has to retry rather than give up.
 */
export class IntakeService {
	private readonly plugin: MSXDAllInOnePlugin;
	private readonly listeners = new Set<() => void>();
	/** Chats seen while listening, newest first. Feeds the allowlist picker. */
	private readonly seenChats: ChatRef[] = [];
	private generation = 0;
	private running = false;
	private status: IntakeStatus = { kind: 'stopped' };
	private filed = 0;
	private skipped = 0;
	private lastPath = '';
	private pendingTimeout: number | null = null;
	private pendingResolve: (() => void) | null = null;

	constructor(plugin: MSXDAllInOnePlugin) {
		this.plugin = plugin;
	}

	isRunning(): boolean {
		return this.running;
	}

	getStatus(): IntakeStatus {
		return this.status;
	}

	getFiledCount(): number {
		return this.filed;
	}

	getSkippedCount(): number {
		return this.skipped;
	}

	getLastPath(): string {
		return this.lastPath;
	}

	getSeenChats(): readonly ChatRef[] {
		return this.seenChats;
	}

	/** Subscribes to status changes. Returns the unsubscribe function. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		const generation = ++this.generation;
		this.setStatus({ kind: 'listening' });
		void this.loop(generation);
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		// Moving the generation on tells the loop its result no longer counts.
		this.generation++;
		this.releasePending();
		this.setStatus({ kind: 'stopped' });
	}

	private async loop(generation: number): Promise<void> {
		while (this.isCurrent(generation)) {
			const token = this.plugin.settings.telegram.botToken;
			if (token.length === 0) {
				this.fail('Set a bot token before receiving messages.');
				return;
			}

			try {
				const updates = await getUpdates(
					token,
					this.plugin.settings.intake.offset,
					POLL_TIMEOUT_SECONDS,
				);
				if (!this.isCurrent(generation)) return;
				if (this.status.kind !== 'listening') {
					this.setStatus({ kind: 'listening' });
				}
				await this.consume(updates);
			} catch (error) {
				if (!this.isCurrent(generation)) return;
				const conflict =
					error instanceof TelegramApiError && error.status === 409;
				this.setStatus({
					kind: 'error',
					message: describeError(error, token),
				});
				await this.wait(conflict ? CONFLICT_RETRY_MS : ERROR_RETRY_MS);
			}
		}
	}

	private async consume(updates: unknown[]): Promise<void> {
		if (updates.length === 0) return;

		for (const raw of updates) {
			const parsed = parseUpdate(raw);
			if (parsed === null) continue;

			// The offset moves on even when filing fails. Staying put would ask
			// for the same update forever and block everything behind it.
			this.plugin.settings.intake.offset = parsed.updateId + 1;

			if (parsed.message !== null) {
				await this.file(parsed.message);
			} else if (parsed.skippedWithoutText) {
				this.skipped++;
			}
		}

		await this.plugin.saveSettings();
		this.notify();
	}

	private async file(message: IncomingMessage): Promise<void> {
		// Remembered before the allowlist check: an unknown sender is exactly
		// who the allowlist picker needs to offer.
		this.rememberChat(message.chat);
		if (!isChatAllowed(this.plugin.settings, message.chat.id)) return;

		const target = resolveTarget(this.plugin.settings.inbox, message);
		try {
			const links = await this.saveAttachments(message, target);
			await writeMessage(this.plugin.app.vault, target, message, {
				links,
				separate: this.plugin.settings.inbox.separateMessages,
			});
			this.filed++;
			this.lastPath = target.path;
		} catch (error) {
			// One unwritable path must not stop the queue.
			new Notice(`Could not save a message to ${target.path}`);
			console.error('MSXD plugin: writing a message failed', error);
		}
	}

	/**
	 * Downloads the attachments and returns embeds for them.
	 *
	 * A file that cannot be fetched is reported and skipped rather than thrown:
	 * the caption is still worth saving, and Telegram refuses files over 20 MB,
	 * which is a normal thing to run into rather than a failure of the queue.
	 */
	private async saveAttachments(
		message: IncomingMessage,
		target: RoutingTarget,
	): Promise<string[]> {
		if (message.attachments.length === 0) return [];

		const token = this.plugin.settings.telegram.botToken;
		const links: string[] = [];

		for (const [index, attachment] of message.attachments.entries()) {
			try {
				const remotePath = await getFilePath(token, attachment.fileId);
				const data = await downloadFile(token, remotePath);
				const file = await saveAttachment(
					this.plugin.app.vault,
					target.mediaFolder,
					attachment,
					message,
					index,
					data,
				);
				links.push(embedFor(this.plugin.app, file, target.path));
			} catch (error) {
				const reason =
					error instanceof TelegramApiError
						? error.message
						: 'it could not be saved';
				new Notice(`Skipped a ${attachment.kind}: ${reason}`);
				console.error(
					'MSXD plugin: saving an attachment failed',
					redactToken(String(error), token),
				);
			}
		}
		return links;
	}

	private rememberChat(chat: ChatRef): void {
		const index = this.seenChats.findIndex((seen) => seen.id === chat.id);
		if (index >= 0) this.seenChats.splice(index, 1);
		this.seenChats.unshift(chat);
		if (this.seenChats.length > MAX_SEEN_CHATS) this.seenChats.pop();
	}

	private fail(message: string): void {
		this.running = false;
		this.generation++;
		this.setStatus({ kind: 'error', message });
	}

	private isCurrent(generation: number): boolean {
		return this.running && this.generation === generation;
	}

	private wait(ms: number): Promise<void> {
		return new Promise((resolve) => {
			this.pendingResolve = resolve;
			this.pendingTimeout = window.setTimeout(() => {
				this.releasePending();
			}, ms);
		});
	}

	/** Ends any wait in progress, so stopping does not leave the loop hanging. */
	private releasePending(): void {
		if (this.pendingTimeout !== null) {
			window.clearTimeout(this.pendingTimeout);
			this.pendingTimeout = null;
		}
		const resolve = this.pendingResolve;
		this.pendingResolve = null;
		resolve?.();
	}

	private setStatus(status: IntakeStatus): void {
		this.status = status;
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

/** Uses the vault's own link style, then forces an embed so media shows inline. */
function embedFor(app: App, file: TFile, notePath: string): string {
	const link = app.fileManager.generateMarkdownLink(file, notePath);
	return link.startsWith('!') ? link : `!${link}`;
}

function describeError(error: unknown, token: string): string {
	if (error instanceof TelegramApiError) return error.message;
	return redactToken(`Message intake failed: ${String(error)}`, token);
}
