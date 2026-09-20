import { Notice } from 'obsidian';
import { IncomingMessage } from '../inbox/message';
import type MSXDTelegramPlugin from '../main';
import { findTopic, TopicRef } from '../settings';
import { formatTasksReply } from '../tasks/report';
import { collectTasks, createRange, resolveScope, TaskScope } from '../tasks/scanner';
import { redactToken, sendMessage } from '../telegram/api';
import { escapeHtml, splitMessage } from '../telegram/text';
import { BotCommand, parseCommand, topicCommands } from './parse';

/**
 * Answers the commands a trusted chat sends.
 *
 * Runs after the allowlist check and before routing: a command is a question,
 * not something to file, so a message it claims never reaches a note. Anything
 * that is not a command it knows is left for the routing engine.
 */
export class CommandService {
	private readonly plugin: MSXDTelegramPlugin;

	constructor(plugin: MSXDTelegramPlugin) {
		this.plugin = plugin;
	}

	/**
	 * @returns true when the message was a command, whether or not answering it
	 * worked. A command that failed to send is still not a note.
	 */
	async handle(message: IncomingMessage): Promise<boolean> {
		const parsed = parseCommand(
			message.text,
			this.plugin.settings.telegram.botUsername,
			this.plugin.settings.commands.topics,
		);
		if (parsed === null) return false;

		try {
			const reply = parsed.ok
				? await this.run(parsed.command)
				: parsed.error;
			await this.send(message, reply);
		} catch (error) {
			const token = this.plugin.settings.telegram.botToken;
			new Notice('Could not answer a command sent to the bot.');
			console.error(
				'Telegram Vault Bot: answering a command failed',
				redactToken(String(error), token),
			);
		}
		return true;
	}

	private async run(command: BotCommand): Promise<string> {
		switch (command.name) {
			case 'topics':
				return formatTopicsReply(this.plugin.settings.commands.topics);
			case 'tasks':
				return this.runTasks(command.days, command.topic);
		}
	}

	private async runTasks(days: number, code: string): Promise<string> {
		const topic = code.length > 0 ? findTopic(this.plugin.settings, code) : null;
		if (code.length > 0 && topic === null) {
			return `There is no topic called <code>${escapeHtml(code)}</code>. Send /topics to see them.`;
		}

		const scope = this.resolveTopicScope(topic);
		if (scope === null) {
			return `Topic <code>${escapeHtml(topic?.code ?? '')}</code> points at <code>${escapeHtml(topic?.path ?? '')}</code>, which is not a folder or a note in the vault.`;
		}

		const range = createRange(days);
		const tasks = await collectTasks(this.plugin.app, scope, range);
		return formatTasksReply({
			tasks,
			range,
			days,
			topicCode: topic?.code ?? '',
		});
	}

	/** No topic means the whole vault; a topic has to resolve to a real place. */
	private resolveTopicScope(topic: TopicRef | null): TaskScope | null {
		if (topic === null) return { kind: 'vault' };
		return resolveScope(this.plugin.app, topic.path);
	}

	private async send(message: IncomingMessage, text: string): Promise<void> {
		const token = this.plugin.settings.telegram.botToken;
		for (const chunk of splitMessage(text)) {
			await sendMessage(token, message.chat.id, chunk, message.topicId);
		}
	}
}

/** The reply to `/topics`: the codes, and where each one looks. */
function formatTopicsReply(topics: readonly TopicRef[]): string {
	const usable = topics.filter((topic) => topic.code.length > 0);
	if (usable.length === 0) {
		return 'No topics are set up yet. Add them in the plugin settings, then ask for one with /tasks 3 code.';
	}

	const lines = ['<b>Topics</b>'];
	for (const topic of usable) {
		lines.push(
			`· <code>${escapeHtml(topic.code)}</code> — ${escapeHtml(topic.path)}`,
		);
		const names = topicCommands(topic).map((entry) => `/${entry.name}`);
		if (names.length > 0) {
			lines.push(`  <code>${escapeHtml(names.join(' '))}</code>`);
		}
	}
	const first = usable[0];
	if (first !== undefined) {
		lines.push(
			'',
			`For example: <code>/tasks 3 ${escapeHtml(first.code)}</code>`,
		);
	}
	return lines.join('\n');
}
