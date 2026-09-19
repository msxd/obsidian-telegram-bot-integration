import { ChatRef, isChatType } from './telegram/types';

export interface TelegramSettings {
	/** Bot token from @BotFather. Stored as plain text in the plugin's data.json. */
	botToken: string;
	/** Username of the bot from the last successful token check, without the `@`. */
	botUsername: string;
	/** Chats the bot accepts messages from. Empty means nobody is allowed. */
	allowedChats: ChatRef[];
}

export interface MsxdPluginSettings {
	telegram: TelegramSettings;
}

export const DEFAULT_SETTINGS: MsxdPluginSettings = {
	telegram: {
		botToken: '',
		botUsername: '',
		allowedChats: [],
	},
};

/**
 * Merges stored data with the defaults one section at a time, so a section
 * saved before a new field existed still gets that field's default.
 */
export function mergeSettings(data: unknown): MsxdPluginSettings {
	const stored = (data ?? {}) as Partial<MsxdPluginSettings>;
	const telegram = { ...DEFAULT_SETTINGS.telegram, ...stored.telegram };
	return {
		telegram: {
			...telegram,
			allowedChats: sanitizeChats(telegram.allowedChats),
		},
	};
}

/**
 * Whether the bot may act on a message from this chat.
 *
 * An empty allowlist denies everyone. The allowlist is the only thing standing
 * between the vault and anyone who finds the bot, so it has to fail closed.
 */
export function isChatAllowed(
	settings: MsxdPluginSettings,
	chatId: number,
): boolean {
	return settings.telegram.allowedChats.some((chat) => chat.id === chatId);
}

/** data.json is user editable, so drop anything that is not a usable entry. */
function sanitizeChats(value: unknown): ChatRef[] {
	if (!Array.isArray(value)) return [];
	const chats: ChatRef[] = [];
	const seen = new Set<number>();
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const chat = entry as Partial<ChatRef>;
		if (typeof chat.id !== 'number' || seen.has(chat.id)) continue;
		seen.add(chat.id);
		chats.push({
			id: chat.id,
			type:
				typeof chat.type === 'string' && isChatType(chat.type)
					? chat.type
					: 'private',
			label:
				typeof chat.label === 'string' && chat.label.length > 0
					? chat.label
					: `Chat ${String(chat.id)}`,
			username: typeof chat.username === 'string' ? chat.username : '',
		});
	}
	return chats;
}
