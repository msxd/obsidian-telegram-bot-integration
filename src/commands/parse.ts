/**
 * Reading a chat message as a bot command.
 *
 * Only the commands the plugin knows are claimed. Anything else, including a
 * misspelled one, stays a message and is filed as a note: swallowing it would
 * lose whatever the user wrote.
 */

export type BotCommand =
	| { name: 'tasks'; days: number; topic: string }
	| { name: 'topics' };

export type CommandParse =
	| { ok: true; command: BotCommand }
	| { ok: false; error: string };

/** Longest range `/tasks` accepts, so one command cannot ask for a year. */
const MAX_DAYS = 90;

/** `/tasks`, or `/tasks@bot_name` as Telegram writes it in groups. */
const COMMAND_PATTERN = /^\/([a-zA-Z_]+)(?:@([a-zA-Z0-9_]+))?$/;

const TASKS_USAGE = 'Use /tasks, /tasks 3 or /tasks 3 topic.';

/**
 * @param botUsername from the last token check, used to ignore a command
 * addressed to another bot in the same group. Empty means it cannot be told.
 * @returns null when the text is not a command this plugin answers.
 */
export function parseCommand(
	text: string,
	botUsername: string,
): CommandParse | null {
	// A command is one line. Anything longer is a note that happens to open
	// with a slash, and it belongs in the vault rather than here.
	if (/[\r\n]/.test(text)) return null;

	const [first = '', ...args] = text.trim().split(/\s+/);
	const match = COMMAND_PATTERN.exec(first);
	if (match === null) return null;
	if (!addressesUs(match[2] ?? '', botUsername)) return null;

	switch ((match[1] ?? '').toLowerCase()) {
		case 'tasks':
			return parseTasks(args);
		case 'topics':
			return args.length > 0
				? { ok: false, error: 'The /topics command takes no arguments.' }
				: { ok: true, command: { name: 'topics' } };
		default:
			return null;
	}
}

/**
 * Days and topic can come in either order: a number is the range, anything else
 * is the topic code, and neither is required.
 */
function parseTasks(args: readonly string[]): CommandParse {
	let days = 1;
	let daysGiven = false;
	let topic = '';

	for (const arg of args) {
		if (!daysGiven && /^\d+$/.test(arg)) {
			days = Number.parseInt(arg, 10);
			daysGiven = true;
			continue;
		}
		if (topic.length === 0) {
			topic = arg;
			continue;
		}
		return { ok: false, error: TASKS_USAGE };
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
