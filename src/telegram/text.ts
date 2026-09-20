/**
 * Text helpers for what gets sent to Telegram: escaping and the size limit.
 * No network here, so the rules can be checked without touching the Bot API.
 */

/** Longest text `sendMessage` accepts, counted in UTF-16 code units. */
export const MESSAGE_LIMIT = 4096;

/**
 * Escapes what HTML parse mode would otherwise read as markup.
 *
 * Everything taken out of the vault goes through this: a note is free to hold
 * `<`, and an unbalanced tag makes Telegram refuse the whole message.
 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Cuts a reply into messages Telegram will accept.
 *
 * Breaks happen at line ends, so a task never arrives in halves and the tags
 * this module escaped stay whole. A single line longer than the limit is split
 * anyway, since refusing to send it would be worse.
 */
export function splitMessage(
	text: string,
	limit: number = MESSAGE_LIMIT,
): string[] {
	const chunks: string[] = [];
	let current = '';

	for (const line of text.split('\n')) {
		for (const piece of splitLine(line, limit)) {
			if (current.length === 0) {
				current = piece;
			} else if (current.length + 1 + piece.length <= limit) {
				current += `\n${piece}`;
			} else {
				chunks.push(current);
				current = piece;
			}
		}
	}

	if (current.length > 0) chunks.push(current);
	return chunks;
}

function splitLine(line: string, limit: number): string[] {
	if (line.length <= limit) return [line];
	const pieces: string[] = [];
	for (let start = 0; start < line.length; start += limit) {
		pieces.push(line.slice(start, start + limit));
	}
	return pieces;
}
