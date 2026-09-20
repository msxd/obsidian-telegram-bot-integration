import { isAllowedReaction } from './telegram/reactions';
import { ChatRef, isChatType } from './telegram/types';

export const DEFAULT_INBOX_FOLDER = '_tg_inbox_';
export const DEFAULT_MEDIA_FOLDER = '_tg_inbox_/media';
export const DEFAULT_HEADING = '## {{messageTime:HH:mm}}';
export const DEFAULT_NOTE_NAME =
	'{{messageDate:YYYY-MM-DD}} {{messageTime:HHmmss}}';
/** Id of the rule that catches whatever no other rule claimed. */
export const FALLBACK_RULE_ID = 'fallback';

export interface TelegramSettings {
	/** Bot token from @BotFather. Stored as plain text in the plugin's data.json. */
	botToken: string;
	/** Username of the bot from the last successful token check, without the `@`. */
	botUsername: string;
	/** Chats the bot accepts messages from. Empty means nobody is allowed. */
	allowedChats: ChatRef[];
}

/** One routing rule: which messages it claims, and where and how they are saved. */
export interface MessageRule {
	/** Stable id so the settings UI can reorder and remove rules. */
	id: string;
	/** `{{all}}`, `{{content~text}}` or `{{hashtag~tag}}`. */
	filter: string;
	/** Path template. Ending in `.md` means a note, anything else means a folder. */
	path: string;
	/** Folder template for attachments. Empty falls back to the default rule. */
	mediaPath: string;
	/** Template for the heading written before the message body. */
	heading: string;
	/** Note name template, used when the path points at a folder. */
	noteName: string;
	/** Put a horizontal rule before a message appended to an existing note. */
	separate: boolean;
}

export interface InboxSettings {
	/** Checked top to bottom; the first match wins. */
	rules: MessageRule[];
	/**
	 * Claims everything the rules did not. Always last, cannot be removed, and
	 * its filter is fixed, so a message can never end up with nowhere to go.
	 */
	fallback: MessageRule;
}

/** A named place in the vault a bot command can be pointed at. */
export interface TopicRef {
	/** Stable id so the settings UI can remove the right row. */
	id: string;
	/** What the user types after a command. Matched ignoring case. */
	code: string;
	/** Vault path: a folder, or a single note when it ends in `.md`. */
	path: string;
}

export interface CommandsSettings {
	/** Named folders and notes the commands can be limited to. */
	topics: TopicRef[];
}

export interface IntakeSettings {
	/** Whether the plugin is listening for messages. */
	enabled: boolean;
	/**
	 * Next update id to ask Telegram for. Persisted so a reload neither refiles
	 * what was already saved nor skips what was not.
	 */
	offset: number;
	/**
	 * Emoji the bot reacts with once a message has been saved. Empty means no
	 * reaction. Must be one Telegram allows, so a hand-edited value is dropped.
	 */
	reaction: string;
}

export interface MsxdPluginSettings {
	telegram: TelegramSettings;
	inbox: InboxSettings;
	intake: IntakeSettings;
	commands: CommandsSettings;
}

export function createFallbackRule(): MessageRule {
	return {
		id: FALLBACK_RULE_ID,
		filter: '{{all}}',
		path: DEFAULT_INBOX_FOLDER,
		mediaPath: DEFAULT_MEDIA_FOLDER,
		heading: DEFAULT_HEADING,
		noteName: DEFAULT_NOTE_NAME,
		separate: false,
	};
}

export const DEFAULT_SETTINGS: MsxdPluginSettings = {
	telegram: {
		botToken: '',
		botUsername: '',
		allowedChats: [],
	},
	inbox: {
		rules: [],
		fallback: createFallbackRule(),
	},
	intake: {
		enabled: false,
		offset: 0,
		reaction: '',
	},
	commands: {
		topics: [],
	},
};

/**
 * Merges stored data with the defaults one section at a time, so a section
 * saved before a new field existed still gets that field's default.
 */
export function mergeSettings(data: unknown): MsxdPluginSettings {
	const stored = (data ?? {}) as Partial<MsxdPluginSettings>;
	const telegram = { ...DEFAULT_SETTINGS.telegram, ...stored.telegram };
	const intake = { ...DEFAULT_SETTINGS.intake, ...stored.intake };
	return {
		telegram: {
			...telegram,
			allowedChats: sanitizeChats(telegram.allowedChats),
		},
		inbox: sanitizeInbox(stored.inbox),
		intake: {
			enabled: intake.enabled === true,
			offset:
				typeof intake.offset === 'number' && intake.offset > 0
					? Math.floor(intake.offset)
					: 0,
			reaction:
				typeof intake.reaction === 'string' &&
				isAllowedReaction(intake.reaction)
					? intake.reaction
					: '',
		},
		commands: sanitizeCommands(stored.commands),
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
		id: createId(),
		filter: '{{all}}',
		path: DEFAULT_INBOX_FOLDER,
		mediaPath: '',
		heading: DEFAULT_HEADING,
		noteName: '',
		separate: false,
	};
}

export function isFallbackRule(rule: MessageRule): boolean {
	return rule.id === FALLBACK_RULE_ID;
}

export function createTopic(): TopicRef {
	return { id: createId(), code: '', path: '' };
}

/**
 * The topic a command named, or null when no topic carries that code.
 * Codes are typed on a phone, so the match ignores case and stray spaces.
 */
export function findTopic(
	settings: MsxdPluginSettings,
	code: string,
): TopicRef | null {
	const wanted = code.trim().toLowerCase();
	if (wanted.length === 0) return null;
	return (
		settings.commands.topics.find(
			(topic) => topic.code.trim().toLowerCase() === wanted,
		) ?? null
	);
}

function createId(): string {
	const random = Math.random().toString(36).slice(2, 8);
	return `${Date.now().toString(36)}-${random}`;
}

/**
 * Reads the inbox section, carrying over the layout that kept the fallback in
 * loose fields (`folder`, `defaultHeading`, `mediaFolder`, `noteNameTemplate`,
 * `separateMessages`) before it became a rule of its own.
 */
function sanitizeInbox(value: unknown): InboxSettings {
	const stored = (value ?? {}) as Record<string, unknown>;
	// Separation used to be one switch for every rule; keep it per rule now.
	const legacySeparate = stored.separateMessages === true;
	return {
		rules: sanitizeRules(stored.rules, legacySeparate),
		fallback: sanitizeFallback(stored, legacySeparate),
	};
}

function sanitizeFallback(
	stored: Record<string, unknown>,
	legacySeparate: boolean,
): MessageRule {
	const defaults = createFallbackRule();
	if (typeof stored.fallback === 'object' && stored.fallback !== null) {
		const rule = sanitizeRule(stored.fallback, legacySeparate, defaults);
		// It claims everything by definition, whatever data.json happens to say.
		return { ...rule, id: FALLBACK_RULE_ID, filter: defaults.filter };
	}
	return {
		...defaults,
		path: asString(stored.folder, defaults.path),
		mediaPath: asString(stored.mediaFolder, defaults.mediaPath),
		heading: asString(stored.defaultHeading, defaults.heading),
		noteName: asString(stored.noteNameTemplate, defaults.noteName),
		separate: legacySeparate,
	};
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

function sanitizeRules(value: unknown, legacySeparate: boolean): MessageRule[] {
	if (!Array.isArray(value)) return [];
	const rules: MessageRule[] = [];
	const seen = new Set<string>();
	const blank = { ...createRule(), path: '', heading: '' };

	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const rule = sanitizeRule(entry, legacySeparate, blank);
		// The fallback lives in its own field; a stray copy here would double it.
		if (rule.id === FALLBACK_RULE_ID || seen.has(rule.id)) continue;
		seen.add(rule.id);
		rules.push(rule);
	}
	return rules;
}

function sanitizeRule(
	value: unknown,
	legacySeparate: boolean,
	defaults: MessageRule,
): MessageRule {
	const rule = (value ?? {}) as Partial<MessageRule>;
	return {
		id:
			typeof rule.id === 'string' && rule.id.length > 0
				? rule.id
				: createId(),
		filter: asString(rule.filter, defaults.filter),
		path: asString(rule.path, defaults.path),
		mediaPath: asString(rule.mediaPath, defaults.mediaPath),
		heading: asString(rule.heading, defaults.heading),
		noteName: asString(rule.noteName, defaults.noteName),
		// Rules saved before separation was per-rule inherit the old switch.
		separate:
			typeof rule.separate === 'boolean' ? rule.separate : legacySeparate,
	};
}

function asString(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

/** Reads the commands section, dropping topics `data.json` cannot supply. */
function sanitizeCommands(value: unknown): CommandsSettings {
	const stored = (value ?? {}) as Record<string, unknown>;
	return { topics: sanitizeTopics(stored.topics) };
}

function sanitizeTopics(value: unknown): TopicRef[] {
	if (!Array.isArray(value)) return [];
	const topics: TopicRef[] = [];
	const seen = new Set<string>();

	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const topic = entry as Partial<TopicRef>;
		const id =
			typeof topic.id === 'string' && topic.id.length > 0
				? topic.id
				: createId();
		if (seen.has(id)) continue;
		seen.add(id);
		topics.push({
			id,
			code: asString(topic.code, '').trim(),
			path: asString(topic.path, '').trim(),
		});
	}
	return topics;
}
