/**
 * One task line, as the Tasks plugin writes it.
 *
 * Only the emoji format is read: `- [ ] call the doctor 📅 2026-09-20`. Every
 * field Tasks writes comes after the description, which is also what makes the
 * first field emoji the end of the task's own text.
 */

/** A task found in the vault, ready to be reported. */
export interface TaskItem {
	/** Task text, without the checkbox and without the Tasks fields. */
	text: string;
	/** Due date as `YYYY-MM-DD`, the form days are compared in. */
	due: string;
	/** Vault path of the note the task came from. */
	path: string;
}

export interface ParsedTask {
	/** True for a status the Tasks plugin counts as finished. */
	done: boolean;
	/** Due date as `YYYY-MM-DD`, empty when the line carries none. */
	due: string;
	text: string;
}

/** A list item with a checkbox: `- [ ]`, `* [x]` or `1. [ ]`, indented or not. */
const TASK_PREFIX = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\][ \t]*/;

/** Statuses that mean the task is over and done with, cancelled included. */
const DONE_STATUSES = new Set(['x', 'X', '-']);

/** `📅 2026-09-20`, allowing the variation selector an editor may keep. */
const DUE_FIELD = /\u{1F4C5}️?\s*(\d{4}-\d{2}-\d{2})/u;

/**
 * Emoji that open a Tasks field: due, scheduled, start, created, done,
 * cancelled, recurrence, id, blocked by, and the five priorities. The text of
 * the task ends at the first of them.
 */
const FIELD_START =
	/[\u{1F4C5}\u{23F3}\u{1F6EB}\u{2795}\u{2705}\u{274C}\u{1F501}\u{1F194}\u{26D4}\u{1F53A}\u{23EB}\u{1F53C}\u{1F53D}\u{23EC}]/u;

/** Block id at the end of a line, as `^task-1`. */
const BLOCK_ID = /\s*\^[a-zA-Z0-9-]+$/;

/** Returns null when the line is not a task at all. */
export function parseTaskLine(line: string): ParsedTask | null {
	const prefix = TASK_PREFIX.exec(line);
	if (prefix === null) return null;

	const body = line.slice(prefix[0].length);
	const due = DUE_FIELD.exec(body);
	return {
		done: DONE_STATUSES.has(prefix[1] ?? ' '),
		due: due?.[1] ?? '',
		text: readText(body),
	};
}

function readText(body: string): string {
	const field = FIELD_START.exec(body);
	const text = field === null ? body : body.slice(0, field.index);
	return text.replace(BLOCK_ID, '').trim();
}
