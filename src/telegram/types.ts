export type ChatType = 'private' | 'group' | 'supergroup' | 'channel';

/** A chat the bot has seen, reduced to what the plugin stores and shows. */
export interface ChatRef {
	id: number;
	type: ChatType;
	/** Human readable name for the settings list. */
	label: string;
	/** Telegram username without the `@`, empty when the chat has none. */
	username: string;
}

const CHAT_TYPES: readonly string[] = [
	'private',
	'group',
	'supergroup',
	'channel',
];

export function isChatType(value: string): value is ChatType {
	return CHAT_TYPES.includes(value);
}

/** Parses a chat object from the Bot API, or returns null if it is not one. */
export function toChatRef(value: unknown): ChatRef | null {
	if (typeof value !== 'object' || value === null) return null;
	const chat = value as Record<string, unknown>;
	if (typeof chat.id !== 'number') return null;

	const type =
		typeof chat.type === 'string' && isChatType(chat.type)
			? chat.type
			: 'private';
	const username = typeof chat.username === 'string' ? chat.username : '';

	return { id: chat.id, type, label: buildLabel(chat, username), username };
}

function buildLabel(chat: Record<string, unknown>, username: string): string {
	if (typeof chat.title === 'string' && chat.title.length > 0) {
		return chat.title;
	}
	const name = [chat.first_name, chat.last_name]
		.filter((part): part is string => typeof part === 'string')
		.join(' ')
		.trim();
	if (name.length > 0) return name;
	if (username.length > 0) return `@${username}`;
	return `Chat ${String(chat.id)}`;
}
