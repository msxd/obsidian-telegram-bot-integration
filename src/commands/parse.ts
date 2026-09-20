/**
 * Reading a chat message as a bot command.
 *
 * Only the commands the plugin knows are claimed. Anything else, including a
 * misspelled one, stays a message and is filed as a note: swallowing it would
 * lose whatever the user wrote.
 */

import type { TopicRef } from '../settings';

export type BotCommand =
	| { name: 'tasks'; days: number; topic: string }
	| { name: 'topics' };

export type CommandParse =
	| { ok: true; command: BotCommand }
	| { ok: false; error: string };

/** One name the bot answers to, and the range it stands for. */
export interface CommandName {
	/** Command without the slash, as Telegram writes it. */
	name: string;
	/** Days ahead of today the name covers, or null for today alone. */
	ahead: number | null;
}

/** Longest range `/tasks` accepts, so one command cannot ask for a year. */
export const MAX_DAYS = 90;

/**
 * Days ahead the ready-made aliases stand for: `/tasks2` covers today plus two
 * days, which is the same three days as `/tasks 3`. Every topic gets the same
 * set, so the numbers mean one thing everywhere.
 */
export const ALIAS_DAYS_AHEAD: readonly number[] = [2, 5, 7];

/** Names the plugin owns outright. */
const BUILT_IN_COMMANDS: readonly string[] = ['tasks', 'topics'];

/** `tasks2` and the like: the ready-made ranges of the vault-wide command. */
const BUILT_IN_ALIAS = /^tasks\d+$/;

/** What Telegram accepts as a command name, and so what a topic code must be. */
const COMMAND_NAME = /^[a-z0-9_]{1,32}$/;

/** `/tasks`, `/tasks2`, or `/tasks@bot_name` as Telegram writes it in groups. */
const COMMAND_PATTERN = /^\/([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?$/;

const TASKS_USAGE = 'Use /tasks, /tasks 3 or /tasks 3 topic.';

/** Whether a topic code could be a Telegram command at all. */
export function isCommandName(code: string): boolean {
	return COMMAND_NAME.test(code.toLowerCase());
}

/** Whether the plugin already answers to this name, ranges included. */
export function isReservedCommand(code: string): boolean {
	const name = code.toLowerCase();
	return BUILT_IN_COMMANDS.includes(name) || BUILT_IN_ALIAS.test(name);
}

/** Whether this topic answers to commands of its own. */
export function hasTopicCommands(topic: TopicRef): boolean {
	return (
		topic.commands &&
		isCommandName(topic.code) &&
		!isReservedCommand(topic.code)
	);
}

/** The names a topic answers to, the bare one first. Empty when it has none. */
export function topicCommands(topic: TopicRef): CommandName[] {
	if (!hasTopicCommands(topic)) return [];
	const base = topic.code.toLowerCase();
	return [
		{ name: base, ahead: null },
		...ALIAS_DAYS_AHEAD.map((ahead) => ({
			name: `${base}${String(ahead)}`,
			ahead,
		})),
	];
}

/**
 * @param botUsername from the last token check, used to ignore a command
 * addressed to another bot in the same group. Empty means it cannot be told.
 * @param topics the topics whose own commands are answered as well.
 * @returns null when the text is not a command this plugin answers.
 */
export function parseCommand(
	text: string,
	botUsername: string,
	topics: readonly TopicRef[],
): CommandParse | null {
	// A command is one line. Anything longer is a note that happens to open
	// with a slash, and it belongs in the vault rather than here.
	if (/[\r\n]/.test(text)) return null;

	const [first = '', ...args] = text.trim().split(/\s+/);
	const match = COMMAND_PATTERN.exec(first);
	if (match === null) return null;
	if (!addressesUs(match[2] ?? '', botUsername)) return null;

	const name = (match[1] ?? '').toLowerCase();
	if (name === 'topics') {
		return args.length > 0
			? { ok: false, error: 'The /topics command takes no arguments.' }
			: { ok: true, command: { name: 'topics' } };
	}
	if (name === 'tasks') return buildTasks(args, null, null);

	// A whole name wins over a suffix, so a topic called `work2` is read as
	// itself rather than as `work` plus two days.
	const named = topics.find(
		(topic) =>
			hasTopicCommands(topic) && topic.code.toLowerCase() === name,
	);
	if (named !== undefined) return buildTasks(args, null, named.code);

	const ahead = suffixOf(name, 'tasks');
	if (ahead !== null) return buildTasks(args, ahead, null);

	for (const topic of topics) {
		if (!hasTopicCommands(topic)) continue;
		const topicAhead = suffixOf(name, topic.code.toLowerCase());
		if (topicAhead !== null) return buildTasks(args, topicAhead, topic.code);
	}
	return null;
}

/**
 * The days a name carries after its base: `tasks2` on `tasks` is two days
 * ahead. Null when the name is not this base with a number after it.
 */
function suffixOf(name: string, base: string): number | null {
	if (base.length === 0 || !name.startsWith(base)) return null;
	const suffix = name.slice(base.length);
	return /^\d+$/.test(suffix) ? Number.parseInt(suffix, 10) : null;
}

/**
 * Days and topic can come in either order: a number is the range, anything else
 * is the topic code, and neither is required. Whatever the command name already
 * decided cannot be given again.
 */
function buildTasks(
	args: readonly string[],
	ahead: number | null,
	fixedTopic: string | null,
): CommandParse {
	// `/tasks2` is today plus two days, which is three days of tasks.
	let days = ahead === null ? 1 : ahead + 1;
	let daysGiven = ahead !== null;
	let topic = fixedTopic ?? '';
	const topicFixed = fixedTopic !== null;

	for (const arg of args) {
		if (/^\d+$/.test(arg)) {
			if (daysGiven) {
				return {
					ok: false,
					error:
						ahead === null
							? TASKS_USAGE
							: 'The days are already part of the command name.',
				};
			}
			days = Number.parseInt(arg, 10);
			daysGiven = true;
			continue;
		}
		if (!topicFixed && topic.length === 0) {
			topic = arg;
			continue;
		}
		return {
			ok: false,
			error: topicFixed
				? 'This command already names its topic. Use /tasks 3 topic for another one.'
				: TASKS_USAGE,
		};
	}

	if (days < 1 || days > MAX_DAYS) {
		return { ok: false, error: `Ask for 1 to ${String(MAX_DAYS)} days.` };
	}
	return { ok: true, command: { name: 'tasks', days, topic } };
}

function addressesUs(mention: string, botUsername: string): boolean {
	if (mention.length === 0 || botUsername.length === 0) return true;
	return mention.toLowerCase() === botUsername.toLowerCase();
}
