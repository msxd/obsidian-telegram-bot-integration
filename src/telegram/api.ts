import { requestUrl } from 'obsidian';
import { ChatRef, toChatRef } from './types';

const API_BASE = 'https://api.telegram.org';

/** Token issued by @BotFather: `<bot id>:<auth string>`. */
const TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

/** How far back to look when collecting recently seen chats. */
const UPDATE_LIMIT = 100;

export interface TelegramBotInfo {
	id: number;
	username: string;
	firstName: string;
}

/** A failed Telegram call. The message is safe to show to the user. */
export class TelegramApiError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = 'TelegramApiError';
	}
}

/** Cheap local check so an obviously broken token never reaches the network. */
export function isWellFormedToken(token: string): boolean {
	return TOKEN_PATTERN.test(token);
}

/**
 * Removes the token from text before it reaches a notice or the console.
 * Request URLs carry the token, so error messages can leak it.
 */
export function redactToken(text: string, token: string): string {
	return token.length > 0 ? text.split(token).join('<token>') : text;
}

/**
 * Calls `getMe` to verify that the token belongs to a live bot.
 * @throws {TelegramApiError} when Telegram rejects the token or is unreachable.
 */
export async function getMe(token: string): Promise<TelegramBotInfo> {
	const result = await call(token, 'getMe');
	if (!isBotUser(result)) {
		throw new TelegramApiError('Telegram returned an unexpected response.');
	}
	return {
		id: result.id,
		username: result.username,
		firstName: result.first_name,
	};
}

/**
 * Waits for new updates, confirming everything before `offset`.
 *
 * This is the only caller allowed to pass a positive offset: doing so tells
 * Telegram to drop those updates for good, so it must happen after they have
 * been filed. `timeoutSeconds` holds the connection open until something
 * arrives, which is what makes this long polling rather than a busy loop.
 *
 * @throws {TelegramApiError} on 409 when another reader holds the queue.
 */
export async function getUpdates(
	token: string,
	offset: number,
	timeoutSeconds: number,
): Promise<unknown[]> {
	return asArray(
		await call(token, 'getUpdates', {
			offset,
			timeout: timeoutSeconds,
		}),
	);
}

/**
 * Lists the chats that have written to the bot recently, newest first.
 *
 * Reads the update queue with a negative offset, which returns the tail of the
 * queue *without* confirming it. A positive offset would delete those updates
 * from Telegram, and message intake would never see them.
 *
 * Telegram only keeps unconfirmed updates for 24 hours, so this returns
 * nothing for a bot nobody has written to lately.
 *
 * @throws {TelegramApiError} when Telegram rejects the call or is unreachable.
 */
export async function getRecentChats(token: string): Promise<ChatRef[]> {
	return collectChats(
		asArray(
			await call(token, 'getUpdates', {
				offset: -UPDATE_LIMIT,
				limit: UPDATE_LIMIT,
				timeout: 0,
			}),
		),
	);
}

/**
 * Resolves a file id to a download path.
 *
 * @throws {TelegramApiError} when Telegram refuses, which includes files over
 * the 20 MB a bot is allowed to download.
 */
export async function getFilePath(
	token: string,
	fileId: string,
): Promise<string> {
	const result = await call(token, 'getFile', { file_id: fileId });
	const path =
		typeof result === 'object' && result !== null
			? (result as Record<string, unknown>).file_path
			: undefined;
	if (typeof path !== 'string' || path.length === 0) {
		throw new TelegramApiError(
			'Telegram did not return a download path for this file.',
		);
	}
	return path;
}

/** Downloads a file's bytes from the path `getFilePath` returned. */
export async function downloadFile(
	token: string,
	filePath: string,
): Promise<ArrayBuffer> {
	let response;
	try {
		response = await requestUrl({
			url: `${API_BASE}/file/bot${token}/${filePath}`,
			method: 'GET',
			throw: false,
		});
	} catch (error) {
		const reason = redactToken(describeError(error), token);
		throw new TelegramApiError(`Could not download the file: ${reason}`);
	}
	if (response.status !== 200) {
		throw new TelegramApiError(
			describeFailure(response.status),
			response.status,
		);
	}
	return response.arrayBuffer;
}

async function call(
	token: string,
	method: string,
	params?: Record<string, unknown>,
): Promise<unknown> {
	let response;
	try {
		response = await requestUrl({
			url: `${API_BASE}/bot${token}/${method}`,
			method: 'POST',
			contentType: 'application/json',
			body: JSON.stringify(params ?? {}),
			throw: false,
		});
	} catch (error) {
		const reason = redactToken(describeError(error), token);
		throw new TelegramApiError(`Could not reach Telegram: ${reason}`);
	}

	const body = parseBody(response.text);
	if (body === null || !body.ok) {
		throw new TelegramApiError(
			describeFailure(response.status, body?.description),
			response.status,
		);
	}
	return body.result;
}

function asArray(value: unknown): unknown[] {
	if (!Array.isArray(value)) {
		throw new TelegramApiError('Telegram returned an unexpected response.');
	}
	return value as unknown[];
}

/** Newest first, one entry per chat. */
function collectChats(updates: unknown[]): ChatRef[] {
	const chats = new Map<number, ChatRef>();
	// Telegram returns updates oldest first, so walk backwards.
	for (let i = updates.length - 1; i >= 0; i--) {
		const chat = findChat(updates[i]);
		if (chat !== null && !chats.has(chat.id)) {
			chats.set(chat.id, chat);
		}
	}
	return Array.from(chats.values());
}

/**
 * Digs the chat out of an update without hardcoding the update kinds: every
 * update wraps a single payload (message, channel post, membership change, …)
 * and each of those carries a `chat`.
 */
function findChat(update: unknown): ChatRef | null {
	if (typeof update !== 'object' || update === null) return null;
	for (const payload of Object.values(update)) {
		if (typeof payload !== 'object' || payload === null) continue;
		const chat = toChatRef((payload as Record<string, unknown>).chat);
		if (chat !== null) return chat;
	}
	return null;
}

interface TelegramResponse {
	ok: boolean;
	description?: string;
	result?: unknown;
}

interface TelegramUser {
	id: number;
	username: string;
	first_name: string;
}

function parseBody(text: string): TelegramResponse | null {
	try {
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed !== 'object' || parsed === null) return null;
		const body = parsed as Record<string, unknown>;
		if (typeof body.ok !== 'boolean') return null;
		return {
			ok: body.ok,
			description:
				typeof body.description === 'string'
					? body.description
					: undefined,
			result: body.result,
		};
	} catch {
		return null;
	}
}

function isBotUser(value: unknown): value is TelegramUser {
	if (typeof value !== 'object' || value === null) return false;
	const user = value as Record<string, unknown>;
	return (
		typeof user.id === 'number' &&
		typeof user.username === 'string' &&
		typeof user.first_name === 'string'
	);
}

function describeFailure(status: number, description?: string): string {
	switch (status) {
		case 401:
			return 'Telegram rejected this token. Check it with @BotFather or generate a new one.';
		case 404:
			return 'Telegram does not know this token. Make sure the whole token was copied.';
		case 409:
			return 'Another process is reading this bot’s updates, or a webhook is set. Stop it and try again.';
		case 429:
			return 'Telegram is rate limiting this bot. Try again in a minute.';
		default:
			return description !== undefined
				? `Telegram returned ${String(status)}: ${description}`
				: `Telegram returned ${String(status)}.`;
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
