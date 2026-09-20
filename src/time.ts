import { moment } from 'obsidian';

/**
 * Dates, in the one place allowed to touch moment.
 *
 * Obsidian re-exports moment, but its typings only resolve when moment itself
 * sits somewhere the type checker can reach, which depends on how the tree was
 * installed. Where it does not resolve, `moment` is `any`, and every call on it
 * spreads `any` through whatever formats a date — invisible to `tsc`, because
 * `skipLibCheck` swallows the failure inside `obsidian.d.ts`.
 *
 * Naming the part of moment this plugin uses keeps that to a single cast, and
 * leaves the rest of the code typed either way. Formats still go to moment
 * itself: the rule editor lets the user type its format strings, so nothing
 * here is allowed to reinvent them.
 */

/** How a day is written wherever days are compared or grouped. */
export const DAY_FORMAT = 'YYYY-MM-DD';

/** The part of moment used here. Its calls work in place, hence the fresh starts below. */
interface Instant {
	format(format?: string): string;
	startOf(unit: 'day'): Instant;
	add(amount: number, unit: 'days'): Instant;
	diff(other: Instant, unit: 'days'): number;
}

type InstantFactory = (input?: Date | string, format?: string) => Instant;

const at = moment as unknown as InstantFactory;

/** Formats a date with a moment format string, as typed in settings. */
export function formatDate(date: Date, format: string): string {
	return at(date).format(format);
}

/** Today as a day key. */
export function todayKey(): string {
	return at().startOf('day').format(DAY_FORMAT);
}

/**
 * A day key counted from today, where 0 is today.
 *
 * Every call starts from a fresh instant, since moment's own `add` works on the
 * value it was called on rather than on a copy.
 */
export function dayKeyAhead(days: number): string {
	return at().startOf('day').add(days, 'days').format(DAY_FORMAT);
}

/** Formats a day key for reading, in a moment format. */
export function formatDayKey(day: string, format: string): string {
	return at(day, DAY_FORMAT).format(format);
}

/** Whole days from one day key to the other, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return at(to, DAY_FORMAT).diff(at(from, DAY_FORMAT), 'days');
}
