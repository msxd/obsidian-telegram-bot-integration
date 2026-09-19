import { IncomingMessage } from './message';

export type MessageFilter =
	| { kind: 'all' }
	| { kind: 'content'; value: string }
	| { kind: 'hashtag'; value: string };

export type FilterParseResult =
	| { ok: true; filter: MessageFilter }
	| { ok: false; error: string };

/** `{{name}}` or `{{name~value}}`. */
const FILTER_PATTERN = /^\{\{\s*([a-zA-Z]+)\s*(?:~([\s\S]*?))?\s*\}\}$/;

const SYNTAX_HINT =
	'Use {{all}}, {{content~text}} or {{hashtag~tag}}.';

export function parseFilter(source: string): FilterParseResult {
	const match = FILTER_PATTERN.exec(source.trim());
	if (match === null) {
		return { ok: false, error: `Could not read this filter. ${SYNTAX_HINT}` };
	}

	const name = match[1] ?? '';
	const value = (match[2] ?? '').trim();

	switch (name) {
		case 'all':
			return value.length > 0
				? { ok: false, error: '{{all}} does not take a value.' }
				: { ok: true, filter: { kind: 'all' } };
		case 'content':
			return value.length > 0
				? { ok: true, filter: { kind: 'content', value } }
				: { ok: false, error: 'Add the text to look for: {{content~text}}.' };
		case 'hashtag': {
			// Accept both {{hashtag~idea}} and {{hashtag~#idea}}.
			const tag = value.startsWith('#') ? value.slice(1) : value;
			return tag.length > 0
				? { ok: true, filter: { kind: 'hashtag', value: tag } }
				: { ok: false, error: 'Add the tag to look for: {{hashtag~tag}}.' };
		}
		default:
			return { ok: false, error: `Unknown filter "${name}". ${SYNTAX_HINT}` };
	}
}

/** Matching ignores case, so a tag typed in settings need not match the message exactly. */
export function matchesFilter(
	filter: MessageFilter,
	message: IncomingMessage,
): boolean {
	switch (filter.kind) {
		case 'all':
			return true;
		case 'content':
			return message.text
				.toLowerCase()
				.includes(filter.value.toLowerCase());
		case 'hashtag': {
			const wanted = filter.value.toLowerCase();
			return message.hashtags.some((tag) => tag.toLowerCase() === wanted);
		}
	}
}

/** Short human readable form for the rule list in settings. */
export function describeFilter(filter: MessageFilter): string {
	switch (filter.kind) {
		case 'all':
			return 'All messages';
		case 'content':
			return `Contains "${filter.value}"`;
		case 'hashtag':
			return `Tagged #${filter.value}`;
	}
}
