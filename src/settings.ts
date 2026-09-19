import { ChatRef, isChatType } from './telegram/types';

export const DEFAULT_INBOX_FOLDER = '_tg_inbox_';
export const DEFAULT_HEADING = '## {{messageTime:HH:mm}}';
export const DEFAULT_NOTE_NAME =
	'{{messageDate:YYYY-MM-DD}} {{messageTime:HHmmss}}';

export interface TelegramSettings {
	/** Bot token from @BotFather. Stored as plain text in the plugin's data.json. */
	botToken: string;
	/** Username of the bot from the last successful token check, without the `@`. */
	botUsername: string;
	/** Chats the bot accepts messages from. Empty means nobody is allowed. */
	allowedChats: ChatRef[];
}

/** One routing rule: which messages it claims, and where they go. */
export interface MessageRule {
	/** Stable id so the settings UI can reorder and remove rules. */
	id: string;
	/** `{{all}}`, `{{content~text}}` or `{{hashtag~tag}}`. */
	filter: string;
	/** Path template. Ending in `.md` means a note, anything else means a folder. */
	path: string;
	/** Template for the heading written before the message body. */
	heading: string;
}

export interface InboxSettings {
	/** Where messages go when no rule claims them. */
	folder: string;
	/** Note name template used whenever a path points at a folder. */
	noteNameTemplate: string;
	/** Heading for messages that fall through to the inbox. */
	defaultHeading: string;
	/** Order is priority: the first matching rule wins. */
	rules: MessageRule[];
}

export interface MsxdPluginSettings {
	telegram: TelegramSettings;
	inbox: InboxSettings;
}

export const DEFAULT_SETTINGS: MsxdPluginSettings = {
	telegram: {
		botToken: '',
		botUsername: '',
		allowedChats: [],
	},
	inbox: {
		folder: DEFAULT_INBOX_FOLDER,
		noteNameTemplate: DEFAULT_NOTE_NAME,
		defaultHeading: DEFAULT_HEADING,
		rules: [],
	},
};

/**
 * Merges stored data with the defaults one section at a time, so a section
 * saved before a new field existed still gets that field's default.
 */
export function mergeSettings(data: unknown): MsxdPluginSettings {
	const stored = (data ?? {}) as Partial<MsxdPluginSettings>;
	const telegram = { ...DEFAULT_SETTINGS.telegram, ...stored.telegram };
	const inbox = { ...DEFAULT_SETTINGS.inbox, ...stored.inbox };
	return {
		telegram: {
			...telegram,
			allowedChats: sanitizeChats(telegram.allowedChats),
		},
		inbox: {
			folder: asString(inbox.folder, DEFAULT_INBOX_FOLDER),
			noteNameTemplate: asString(
				inbox.noteNameTemplate,
				DEFAULT_NOTE_NAME,
			),
			defaultHeading: asString(inbox.defaultHeading, DEFAULT_HEADING),
			rules: sanitizeRules(inbox.rules),
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

export function createRule(): MessageRule {
	return {
		id: createRuleId(),
		filter: '{{all}}',
		path: DEFAULT_INBOX_FOLDER,
		heading: DEFAULT_HEADING,
	};
}

function createRuleId(): string {
	const random = Math.random().toString(36).slice(2, 8);
	return `${Date.now().toString(36)}-${random}`;
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

function sanitizeRules(value: unknown): MessageRule[] {
	if (!Array.isArray(value)) return [];
	const rules: MessageRule[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const rule = entry as Partial<MessageRule>;
		const id =
			typeof rule.id === 'string' &&
			rule.id.length > 0 &&
			!seen.has(rule.id)
				? rule.id
				: createRuleId();
		seen.add(id);
		rules.push({
			id,
			filter: asString(rule.filter, ''),
			path: asString(rule.path, ''),
			heading: asString(rule.heading, ''),
		});
	}
	return rules;
}

function asString(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}
