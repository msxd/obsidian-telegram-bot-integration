import { Notice, SettingGroup } from 'obsidian';
import type MSXDAllInOnePlugin from '../main';
import { getRecentChats, redactToken, TelegramApiError } from '../telegram/api';
import { ChatRef, ChatType } from '../telegram/types';
import { SettingsSection } from './section';

type LookupStatus =
	| { kind: 'idle' }
	| { kind: 'loading' }
	| { kind: 'done'; found: number }
	| { kind: 'error'; message: string };

const CHAT_TYPE_LABELS: Record<ChatType, string> = {
	private: 'Private chat',
	group: 'Group',
	supergroup: 'Supergroup',
	channel: 'Channel',
};

export class AllowedChatsSection implements SettingsSection {
	private readonly plugin: MSXDAllInOnePlugin;
	private parentEl: HTMLElement | null = null;
	/** The group elements this section owns, so a redraw can replace them in place. */
	private groupEls: Element[] = [];
	/** Chats seen in the last lookup. Not persisted: it is a live view, not a setting. */
	private candidates: ChatRef[] = [];
	private status: LookupStatus = { kind: 'idle' };
	private loading = false;

	constructor(plugin: MSXDAllInOnePlugin) {
		this.plugin = plugin;
	}

	render(containerEl: HTMLElement): void {
		this.parentEl = containerEl;
		this.groupEls = [];
		this.renderSection();
	}

	dispose(): void {
		this.parentEl = null;
		this.groupEls = [];
	}

	/**
	 * Redraws both groups from state. There is no text input here, so a full
	 * redraw costs nothing and keeps the buttons in sync with what is allowed.
	 *
	 * The groups are built detached and then swapped in as direct children of
	 * the tab. Obsidian spaces setting groups by their position among siblings,
	 * so keeping them inside a wrapper element would leave the first group
	 * without its top margin.
	 */
	private renderSection(): void {
		const parent = this.parentEl;
		if (!parent) return;

		const staging = createDiv();
		this.renderAllowed(staging);
		this.renderCandidates(staging);

		const replacement = Array.from(staging.children);
		const anchor = this.groupEls[0] ?? null;
		for (const el of replacement) {
			parent.insertBefore(el, anchor);
		}
		for (const el of this.groupEls) {
			el.detach();
		}
		this.groupEls = replacement;
	}

	private renderAllowed(containerEl: HTMLElement): void {
		const { allowedChats } = this.plugin.settings.telegram;
		const group = new SettingGroup(containerEl)
			.setHeading('Allowed chats')
		;

		if (allowedChats.length === 0) {
			group.addSetting((setting) => {
				setting
					.setName('Nothing allowed yet')
					.setDesc(
						'The bot ignores every message until a chat is allowed here.',
					);
			});
			return;
		}

		for (const chat of allowedChats) {
			group.addSetting((setting) => {
				setting
					.setName(chat.label)
					.setDesc(describeChat(chat))
					.addExtraButton((button) => {
						button
							.setIcon('x')
							.setTooltip('Remove from the allowlist')
							.onClick(async () => {
								await this.disallow(chat.id);
							});
					});
			});
		}
	}

	private renderCandidates(containerEl: HTMLElement): void {
		const group = new SettingGroup(containerEl).setHeading(
			'Recently seen chats',
		);

		group.addSetting((setting) => {
			setting
				.setName('Look up recent chats')
				.setDesc(this.buildLookupDescription())
				.addButton((button) => {
					button
						.setButtonText('Refresh')
						.setDisabled(this.loading)
						.onClick(async () => {
							await this.refresh();
						});
				});
		});

		for (const chat of this.pendingCandidates()) {
			group.addSetting((setting) => {
				setting
					.setName(chat.label)
					.setDesc(describeChat(chat))
					.addButton((button) => {
						button
							.setButtonText('Allow')
							.setCta()
							.onClick(async () => {
								await this.allow(chat);
							});
					});
			});
		}
	}

	private buildLookupDescription(): DocumentFragment {
		return createFragment((fragment) => {
			fragment.createDiv({
				text: 'Write to the bot from the chat you want to allow, then refresh. Telegram only keeps unread updates for 24 hours, so older chats will not show up.',
			});
			const text = this.buildStatusText();
			if (text.length === 0) return;
			fragment.createDiv({
				cls: `msxd-status${this.status.kind === 'error' ? ' is-error' : ''}`,
				text,
			});
		});
	}

	private buildStatusText(): string {
		switch (this.status.kind) {
			case 'idle':
				return '';
			case 'loading':
				return 'Reading the update queue…';
			case 'error':
				return this.status.message;
			case 'done': {
				if (this.status.found === 0) {
					return 'No recent chats found.';
				}
				const pending = this.pendingCandidates().length;
				return pending === 0
					? 'Every recent chat is already allowed.'
					: `${countChats(pending)} to choose from.`;
			}
		}
	}

	/** Recently seen chats that are not on the allowlist yet. */
	private pendingCandidates(): ChatRef[] {
		const { allowedChats } = this.plugin.settings.telegram;
		const allowed = new Set(allowedChats.map((chat) => chat.id));
		return this.candidates.filter((chat) => !allowed.has(chat.id));
	}

	private async refresh(): Promise<void> {
		const token = this.plugin.settings.telegram.botToken;
		if (token.length === 0) {
			this.status = { kind: 'error', message: 'Set a bot token first.' };
			this.renderSection();
			return;
		}

		this.loading = true;
		this.status = { kind: 'loading' };
		this.renderSection();
		try {
			this.candidates = await getRecentChats(token);
			this.status = { kind: 'done', found: this.candidates.length };
		} catch (error) {
			this.candidates = [];
			const message =
				error instanceof TelegramApiError
					? error.message
					: redactToken(
							`Could not read updates: ${String(error)}`,
							token,
						);
			this.status = { kind: 'error', message };
			new Notice(message);
		} finally {
			this.loading = false;
			this.renderSection();
		}
	}

	private async allow(chat: ChatRef): Promise<void> {
		const { telegram } = this.plugin.settings;
		if (telegram.allowedChats.some((known) => known.id === chat.id)) return;
		telegram.allowedChats.push(chat);
		await this.plugin.saveSettings();
		this.renderSection();
	}

	private async disallow(chatId: number): Promise<void> {
		const { telegram } = this.plugin.settings;
		telegram.allowedChats = telegram.allowedChats.filter(
			(chat) => chat.id !== chatId,
		);
		await this.plugin.saveSettings();
		this.renderSection();
	}
}

function describeChat(chat: ChatRef): string {
	const parts = [CHAT_TYPE_LABELS[chat.type]];
	if (chat.username.length > 0) parts.push(`@${chat.username}`);
	parts.push(`id ${String(chat.id)}`);
	return parts.join(' · ');
}

function countChats(count: number): string {
	return count === 1 ? '1 chat' : `${String(count)} chats`;
}
