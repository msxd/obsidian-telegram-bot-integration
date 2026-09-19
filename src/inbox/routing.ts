import { normalizePath } from 'obsidian';
import {
	DEFAULT_INBOX_FOLDER,
	DEFAULT_MEDIA_FOLDER,
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
	/** The rule that claimed the message, or null when it fell through to the inbox. */
	rule: MessageRule | null;
}

/**
 * Decides where a message goes. Rules are tried top to bottom and the first
 * match wins; a message no rule claims lands in the inbox rather than nowhere.
 */
export function resolveTarget(
	settings: InboxSettings,
	message: IncomingMessage,
): RoutingTarget {
	const rule = findRule(settings.rules, message);
	const heading = rule !== null ? rule.heading : settings.defaultHeading;
	const pathTemplate = rule !== null ? rule.path : settings.folder;
	return {
		path: buildNotePath(pathTemplate, settings, message),
		mediaFolder: buildMediaFolder(rule?.mediaPath ?? '', settings, message),
		heading: renderTextTemplate(heading, message),
		rule,
	};
}

/**
 * Attachments always land in a folder: the file itself dictates the extension,
 * so there is nothing for a note-style path to name. An empty rule template
 * falls back to the shared media folder.
 */
function buildMediaFolder(
	template: string,
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const rendered = cleanPath(renderPathTemplate(template, message));
	if (rendered.length > 0) return normalizePath(rendered);

	const shared = cleanPath(renderPathTemplate(settings.mediaFolder, message));
	return normalizePath(shared.length > 0 ? shared : DEFAULT_MEDIA_FOLDER);
}

/**
 * The path this rule would produce, whether or not its filter matches. Settings
 * use it to preview a rule against a sample message while it is being edited.
 */
export function previewRulePath(
	settings: InboxSettings,
	rule: MessageRule,
	message: IncomingMessage,
): string {
	return buildNotePath(rule.path, settings, message);
}

/** The media folder this rule would use, for the same preview. */
export function previewRuleMediaFolder(
	settings: InboxSettings,
	rule: MessageRule,
	message: IncomingMessage,
): string {
	return buildMediaFolder(rule.mediaPath, settings, message);
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
 * the shared note name template.
 */
function buildNotePath(
	template: string,
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const rendered = cleanPath(renderPathTemplate(template, message));
	if (rendered.toLowerCase().endsWith(NOTE_EXTENSION)) {
		return normalizePath(rendered);
	}

	const folder = rendered.length > 0 ? rendered : fallbackFolder(settings, message);
	const name = buildNoteName(settings, message);
	return normalizePath(folder.length > 0 ? `${folder}/${name}` : name);
}

/** Keeps messages out of the vault root when a rule renders to nothing. */
function fallbackFolder(
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const inbox = cleanPath(renderPathTemplate(settings.folder, message));
	return inbox.length > 0 ? inbox : DEFAULT_INBOX_FOLDER;
}

function buildNoteName(
	settings: InboxSettings,
	message: IncomingMessage,
): string {
	const rendered = cleanPath(
		renderPathTemplate(settings.noteNameTemplate, message),
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
