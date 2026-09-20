import { App, moment, normalizePath, TFile, TFolder } from 'obsidian';
import { parseTaskLine, TaskItem } from './task';

/** How a day is written wherever it is compared or grouped. */
export const DAY_FORMAT = 'YYYY-MM-DD';

/** The part of the vault a command looks through. */
export type TaskScope =
	| { kind: 'vault' }
	| { kind: 'folder'; path: string }
	| { kind: 'file'; path: string };

/**
 * Inclusive range of days. Kept as `YYYY-MM-DD` strings because that form
 * compares correctly with `<` and `>`, which keeps time zones out of it.
 */
export interface DayRange {
	from: string;
	to: string;
}

/** Counted from today, so one day means today alone. */
export function createRange(days: number): DayRange {
	const start = moment().startOf('day');
	return {
		from: start.format(DAY_FORMAT),
		to: start
			.clone()
			.add(days - 1, 'days')
			.format(DAY_FORMAT),
	};
}

export function today(): string {
	return moment().startOf('day').format(DAY_FORMAT);
}

/**
 * Reads a topic's path as a place to search.
 *
 * @returns null when nothing in the vault sits at this path, or when it is a
 * file that is not a note.
 */
export function resolveScope(app: App, path: string): TaskScope | null {
	const normalized = normalizePath(path);
	if (normalized.length === 0 || normalized === '/') return { kind: 'vault' };

	const file = app.vault.getAbstractFileByPath(normalized);
	if (file instanceof TFolder) return { kind: 'folder', path: normalized };
	if (file instanceof TFile && file.extension === 'md') {
		return { kind: 'file', path: normalized };
	}
	return null;
}

/** Open tasks due inside the range, earliest first. */
export async function collectTasks(
	app: App,
	scope: TaskScope,
	range: DayRange,
): Promise<TaskItem[]> {
	const tasks: TaskItem[] = [];

	for (const file of listFiles(app, scope)) {
		if (!mayHaveTasks(app, file)) continue;

		const content = await app.vault.cachedRead(file);
		for (const line of content.split('\n')) {
			const task = parseTaskLine(line);
			if (task === null || task.done) continue;
			// A task without a due date sorts below `from` and drops out here.
			if (task.due < range.from || task.due > range.to) continue;
			tasks.push({ text: task.text, due: task.due, path: file.path });
		}
	}

	tasks.sort(compareTasks);
	return tasks;
}

function listFiles(app: App, scope: TaskScope): TFile[] {
	if (scope.kind === 'file') {
		const file = app.vault.getAbstractFileByPath(scope.path);
		return file instanceof TFile ? [file] : [];
	}

	const files = app.vault.getMarkdownFiles();
	if (scope.kind === 'vault') return files;

	const prefix = `${scope.path}/`;
	return files.filter((file) => file.path.startsWith(prefix));
}

/**
 * Whether the note is worth reading at all.
 *
 * The metadata cache already knows which notes hold checkboxes, so a vault-wide
 * search only reads the few that do. A note Obsidian has not indexed yet has no
 * cache entry, and is read rather than missed.
 */
function mayHaveTasks(app: App, file: TFile): boolean {
	const cache = app.metadataCache.getFileCache(file);
	if (cache === null) return true;
	return cache.listItems?.some((item) => item.task !== undefined) ?? false;
}

function compareTasks(left: TaskItem, right: TaskItem): number {
	if (left.due !== right.due) return left.due < right.due ? -1 : 1;
	if (left.path !== right.path) return left.path < right.path ? -1 : 1;
	return left.text.localeCompare(right.text);
}
