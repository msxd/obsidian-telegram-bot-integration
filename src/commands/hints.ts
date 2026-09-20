import type { TopicRef } from '../settings';
import type { TelegramCommand } from '../telegram/api';
import { ALIAS_DAYS_AHEAD, topicCommands } from './parse';

/** A menu entry, plus whether the name is a command's own or one of its ranges. */
interface Entry extends TelegramCommand {
	wholeName: boolean;
}

/** Telegram refuses a longer menu. */
export const MAX_COMMANDS = 100;

/**
 * The menu Telegram offers in the chat: the plugin's own commands, then one set
 * per topic that carries commands.
 *
 * Built from the same numbers the parser reads, so the menu cannot promise a
 * range the bot would not answer.
 */
export function buildCommandHints(
	topics: readonly TopicRef[],
): TelegramCommand[] {
	const entries: Entry[] = [
		{
			command: 'tasks',
			description: 'Tasks due today, or /tasks 3 for the next three days',
			wholeName: true,
		},
	];

	for (const ahead of ALIAS_DAYS_AHEAD) {
		entries.push({
			command: `tasks${String(ahead)}`,
			description: describeRange(ahead, ''),
			wholeName: false,
		});
	}
	entries.push({
		command: 'topics',
		description: 'List the topic codes /tasks understands',
		wholeName: true,
	});

	for (const topic of topics) {
		for (const { name, ahead } of topicCommands(topic)) {
			entries.push({
				command: name,
				description: describeRange(ahead, topic.code),
				wholeName: ahead === null,
			});
		}
	}
	return dedupe(entries);
}

/**
 * Drops the entries Telegram would refuse as duplicates, leaving the one that
 * will actually answer.
 *
 * Two topics can lay claim to one name: a topic called `work2` owns `/work2`,
 * and so does the two-day alias of a topic called `work`. The parser reads a
 * whole name before it reads a suffix, so the menu has to say the same.
 */
function dedupe(entries: readonly Entry[]): TelegramCommand[] {
	const whole = new Set(
		entries.filter((entry) => entry.wholeName).map((entry) => entry.command),
	);
	const seen = new Set<string>();
	const hints: TelegramCommand[] = [];

	for (const entry of entries) {
		if (!entry.wholeName && whole.has(entry.command)) continue;
		if (seen.has(entry.command)) continue;
		seen.add(entry.command);
		hints.push({
			command: entry.command,
			description: entry.description,
		});
	}
	return hints;
}

function describeRange(ahead: number | null, topicCode: string): string {
	const days =
		ahead === null
			? 'Tasks due today'
			: `Tasks due today and the next ${String(ahead)} ${ahead === 1 ? 'day' : 'days'}`;
	return topicCode.length > 0 ? `${days} in ${topicCode}` : days;
}
