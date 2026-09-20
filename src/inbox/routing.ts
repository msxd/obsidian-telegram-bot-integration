import { normalizePath } from 'obsidian';
import {
	DEFAULT_INBOX_FOLDER,
	DEFAULT_MEDIA_FOLDER,
	DEFAULT_NOTE_NAME,
	InboxSettings,
	MessageRule,
} from '../settings';
import { matchesFilter, parseFilter } from './filter';
import { IncomingMessage } from './message';
import { renderPathTemplate, renderTextTemplate } from './template';

const NOTE_EXTENSION = '.md';

export interface RoutingTarget {
	/** Vault path of the note, always ending in `.md`. */
	path: string;
	/** Folder attachments are saved into. */
	mediaFolder: string;
	/** Text written before the message body. */
	heading: string;
	/** Whether to put a horizontal rule above a message appended to a note. */
	separate: boolean;
	/** The rule that claimed the message, possibly the fallback one. */
	rule: MessageRule;
}

/**
 * Decides where a message goes. Rules are tried top to bottom and the first
 * match wins; whatever none of them claims belongs to the fallback rule, so a
 * message always has somewhere to land.
 */
export function resolveTarget(
	settings: InboxSettings,
	message: IncomingMessage,
): RoutingTarget {
	const rule = findRule(settings.rules, message) ?? settings.fallback;
	return {
		path: buildNotePath(rule, settings, message),
		mediaFolder: buildMediaFolder(rule, settings, message),
		heading: renderTextTemplate(rule.heading, message),
		separate: rule.separate,
		rule,
	};
}

/** The path this rule would produce, whether or not its filter matches. */
export function previewRulePath(
	settings: InboxSettings,
	rule: MessageRule,
	message: IncomingMessage,
): string {
	return buildNotePath(rule, settings, message);
}

/** The media folder this rule would use, for the same preview. */
export function previewRuleMediaFolder(
	settings: InboxSettings,
	rule: MessageRule,
	message: IncomingMessage,
): string {
	return buildMediaFolder(rule, settings, message);
}

function findRule(
	rules: MessageRule[],
	message: IncomingMessage,
): MessageRule | null {
	for (const rule of rules) {
		const parsed = parseFilter(rule.filter);
		// A rule whose filter does not parse is skipped; settings flag it separately.
		if (parsed.ok && matchesFilter(parsed.filter, message)) return rule;
	}
	return null;
}

/**
 * A template ending in `.md` names the note itself, so several messages can
 * collect in one file. Anything else is a folder, and the note name comes from
 * the rule's own template.
 */
function buildNotePath(
	rule: MessageRule,
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const rendered = cleanPath(renderPathTemplate(rule.path, message));
	if (rendered.toLowerCase().endsWith(NOTE_EXTENSION)) {
		return normalizePath(rendered);
	}

	const folder =
		rendered.length > 0 ? rendered : fallbackFolder(settings, message);
	const name = buildNoteName(rule, settings, message);
	return normalizePath(folder.length > 0 ? `${folder}/${name}` : name);
}

/** Keeps messages out of the vault root when a rule renders to nothing. */
function fallbackFolder(
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const folder = cleanPath(
		renderPathTemplate(settings.fallback.path, message),
	);
	return folder.length > 0 ? folder : DEFAULT_INBOX_FOLDER;
}

/**
 * Attachments always land in a folder: the file itself dictates the extension,
 * so there is nothing for a note-style path to name. An empty rule template
 * falls back to the one on the fallback rule.
 */
function buildMediaFolder(
	rule: MessageRule,
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const rendered = cleanPath(renderPathTemplate(rule.mediaPath, message));
	if (rendered.length > 0) return normalizePath(rendered);

	const shared = cleanPath(
		renderPathTemplate(settings.fallback.mediaPath, message),
	);
	return normalizePath(shared.length > 0 ? shared : DEFAULT_MEDIA_FOLDER);
}

function buildNoteName(
	rule: MessageRule,
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const own = rule.noteName.length > 0 ? rule.noteName : '';
	const shared =
		settings.fallback.noteName.length > 0
			? settings.fallback.noteName
			: DEFAULT_NOTE_NAME;
	const rendered = cleanPath(
		renderPathTemplate(own.length > 0 ? own : shared, message),
	);
	// The message id is the one thing always available to name a note after.
	const name = rendered.length > 0 ? rendered : String(message.messageId);
	return name.toLowerCase().endsWith(NOTE_EXTENSION)
		? name
		: `${name}${NOTE_EXTENSION}`;
}

/**
 * Drops empty segments, so a variable that resolves to nothing cannot leave a
 * hole, and folds whitespace. Path templates are edited in a text area, so they
 * can carry line breaks that have no business in a file name.
 */
function cleanPath(path: string): string {
	return path
		.split('/')
		.map((segment) => segment.replace(/\s+/g, ' ').trim())
		.filter((segment) => segment.length > 0)
		.join('/');
}
