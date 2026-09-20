import { moment } from 'obsidian';
import { escapeHtml } from '../telegram/text';
import { DAY_FORMAT, DayRange, today } from './scanner';
import { TaskItem } from './task';

/** Marks a day in the reply. Written as an escape so the file stays ASCII. */
const DAY_MARK = '\u{1F4C5}';

/** Shown for a line that carries a due date but no words of its own. */
const UNTITLED = 'Untitled task';

/**
 * Longest task text a reply repeats. Keeps one runaway line from eating a whole
 * message, and keeps every line well inside what Telegram accepts.
 */
const MAX_TASK_LENGTH = 300;

export interface TasksReport {
	tasks: readonly TaskItem[];
	range: DayRange;
	/** Days asked for, which is what an empty answer has to explain. */
	days: number;
	/** Topic the search was limited to, empty when it covered the vault. */
	topicCode: string;
}

/** The reply to `/tasks`, as HTML for Telegram's parse mode. */
export function formatTasksReply(report: TasksReport): string {
	const header =
		report.topicCode.length > 0
			? `Tasks in <b>${escapeHtml(report.topicCode)}</b>`
			: '';

	if (report.tasks.length === 0) {
		const nothing = describeEmpty(report.days);
		return header.length > 0 ? `${header}\n\n${nothing}` : nothing;
	}

	const lines: string[] = [];
	if (header.length > 0) lines.push(header, '');

	for (const [day, group] of groupByDay(report.tasks)) {
		lines.push(`<b>${DAY_MARK} ${describeDay(day)}</b>`);
		for (const task of group) {
			lines.push(`· ${escapeHtml(shorten(task.text))}`);
		}
		lines.push('');
	}
	return lines.join('\n').trimEnd();
}

/** Days in the order they fall, each with the tasks due on it. */
function groupByDay(tasks: readonly TaskItem[]): Map<string, TaskItem[]> {
	const days = new Map<string, TaskItem[]>();
	for (const task of tasks) {
		const group = days.get(task.due);
		if (group === undefined) {
			days.set(task.due, [task]);
		} else {
			group.push(task);
		}
	}
	return days;
}

function describeDay(day: string): string {
	const date = moment(day, DAY_FORMAT);
	const start = moment(today(), DAY_FORMAT);
	const distance = date.diff(start, 'days');
	const short = date.format('DD MMM');

	if (distance === 0) return `Today, ${short}`;
	if (distance === 1) return `Tomorrow, ${short}`;
	return date.format('ddd, DD MMM');
}

function describeEmpty(days: number): string {
	return days === 1
		? 'Nothing due today.'
		: `Nothing due in the next ${String(days)} days.`;
}

function shorten(text: string): string {
	const trimmed = text.length > 0 ? text : UNTITLED;
	return trimmed.length > MAX_TASK_LENGTH
		? `${trimmed.slice(0, MAX_TASK_LENGTH).trimEnd()}…`
		: trimmed;
}
