import { requestUrl } from 'obsidian';

const API_BASE = 'https://api.telegram.org';

/** Token issued by @BotFather: `<bot id>:<auth string>`. */
const TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

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
	let response;
	try {
		response = await requestUrl({
			url: `${API_BASE}/bot${token}/getMe`,
			method: 'GET',
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
	if (!isBotUser(body.result)) {
		throw new TelegramApiError('Telegram returned an unexpected response.');
	}
	return {
		id: body.result.id,
		username: body.result.username,
		firstName: body.result.first_name,
	};
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
