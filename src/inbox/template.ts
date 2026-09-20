import { formatDate } from '../time';
import { IncomingMessage } from './message';

/** `{{name}}` or `{{name:argument}}`. */
const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;
const VARIABLE_BODY = /^([a-zA-Z]+)(?::([\s\S]*))?$/;

/** Forbidden by the file system, or by Obsidian because they have meaning in links. */
const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|#^[\]]/g;
/** Unicode control characters, which includes the newlines a message may carry. */
const CONTROL_CHARACTERS = /\p{Cc}/gu;

/**
 * Fills a template that becomes part of a file path. Only the substituted
 * values are cleaned, never the template itself, so `/` typed in settings keeps
 * working as a folder separator.
 */
export function renderPathTemplate(
	template: string,
	message: IncomingMessage,
): string {
	return render(template, message, sanitizeForFileName);
}

/** Fills a template that becomes text inside a note, where nothing is forbidden. */
export function renderTextTemplate(
	template: string,
	message: IncomingMessage,
): string {
	return render(template, message, (value) => value);
}

function render(
	template: string,
	message: IncomingMessage,
	clean: (value: string) => string,
): string {
	return template.replace(
		VARIABLE_PATTERN,
		(whole: string, body: string): string => {
			const value = resolveVariable(body, message);
			// An unknown variable is left as typed, so a mistake shows up in the
			// preview instead of silently collapsing into an empty path segment.
			return value === null ? whole : clean(value);
		},
	);
}

/** Returns null when the variable is not one we know, so it can be left alone. */
function resolveVariable(
	body: string,
	message: IncomingMessage,
): string | null {
	const match = VARIABLE_BODY.exec(body.trim());
	if (match === null) return null;

	const name = match[1] ?? '';
	const argument = (match[2] ?? '').trim();

	switch (name) {
		case 'content':
			return sliceContent(message.text, argument);
		case 'chat':
			return message.chat.label;
		case 'chatId':
			return String(message.chat.id);
		case 'topic':
			return message.topicName;
		case 'topicId':
			return message.topicId === null ? '' : String(message.topicId);
		case 'messageId':
			return String(message.messageId);
		case 'user':
			return message.username.length > 0
				? message.username
				: String(message.userId);
		case 'userId':
			return String(message.userId);
		case 'messageDate':
		case 'messageTime':
			return argument.length > 0
				? formatDate(message.date, argument)
				: null;
		case 'hashtag':
			return pickHashtag(message.hashtags, argument);
		default:
			return null;
	}
}

function sliceContent(text: string, argument: string): string | null {
	const limit = Number.parseInt(argument, 10);
	if (!Number.isFinite(limit) || limit <= 0) return null;
	return text.slice(0, limit);
}

/** `{{hashtag:[1]}}` picks the second hashtag; a missing one yields an empty value. */
function pickHashtag(hashtags: string[], argument: string): string | null {
	const match = /^\[(\d+)\]$/.exec(argument);
	if (match === null) return null;
	const index = Number.parseInt(match[1] ?? '', 10);
	return hashtags[index] ?? '';
}

/** Strips what a file name may not hold. Shared with attachment naming. */
export function sanitizeForFileName(value: string): string {
	return (
		value
			.replace(CONTROL_CHARACTERS, ' ')
			.replace(UNSAFE_IN_FILE_NAME, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			// Leading and trailing dots make for awkward file names on Windows.
			.replace(/^\.+|\.+$/g, '')
			.trim()
	);
}
