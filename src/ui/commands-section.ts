import { App, normalizePath, Setting, SettingGroup, TFile, TFolder } from 'obsidian';
import {
	hasTopicCommands,
	isCommandName,
	isReservedCommand,
	topicCommands,
} from '../commands/parse';
import type MSXDTelegramPlugin from '../main';
import { createTopic, TopicRef } from '../settings';
import { replaceGroups, SettingsSection } from './section';

/** Topics: the named folders and notes bot commands can be pointed at. */
export class CommandsSection implements SettingsSection {
	private readonly plugin: MSXDTelegramPlugin;
	private parentEl: HTMLElement | null = null;
	private groupEls: Element[] = [];

	constructor(plugin: MSXDTelegramPlugin) {
		this.plugin = plugin;
	}

	render(containerEl: HTMLElement): void {
		this.parentEl = containerEl;
		this.groupEls = [];
		this.renderSection();
	}

	dispose(): void {
		this.parentEl = null;
		this.groupEls = [];
	}

	private renderSection(): void {
		const parent = this.parentEl;
		if (!parent) return;
		this.groupEls = replaceGroups(parent, this.groupEls, (containerEl) => {
			this.renderTopics(containerEl);
		});
	}

	private renderTopics(containerEl: HTMLElement): void {
		const { topics } = this.plugin.settings.commands;
		const group = new SettingGroup(containerEl).setHeading('Commands');

		group.addSetting((setting) => {
			setting
				.setName('Topics')
				.setDesc(this.describeCommands())
				.addButton((button) => {
					button
						.setButtonText('Add topic')
						.setCta()
						.onClick(() => {
							void this.add();
						});
				});
		});

		for (const topic of topics) {
			group.addSetting((setting) => {
				this.buildTopicSetting(setting, topic);
			});
		}
	}

	private describeCommands(): DocumentFragment {
		return createFragment((fragment) => {
			fragment.createDiv({
				text: 'A topic is a code word for one folder or one note, so a command can stay inside it. Without a topic the whole vault is searched.',
			});
			fragment.createDiv({
				text: 'From an allowed chat: /tasks for what is due today, /tasks 3 for the next three days, /tasks 3 code for a topic, and /topics for the list of codes. The ready-made /tasks2, /tasks5 and /tasks7 cover today plus that many days.',
			});
			fragment.createDiv({
				text: 'A topic with commands switched on answers to its own code the same way, so /work2 is /tasks 3 work. Register them with Telegram from the Command hints button above.',
			});
			if (!this.plugin.settings.intake.enabled) {
				fragment.createDiv({
					cls: 'msxd-status is-error',
					text: 'Receiving is off, so no command reaches the bot.',
				});
			}
		});
	}

	/**
	 * One row: the code, the path, whether the topic gets commands of its own,
	 * and what all of that currently means. Typing only saves, never redraws:
	 * a redraw would rebuild the input and take the focus away mid-word.
	 */
	private buildTopicSetting(setting: Setting, topic: TopicRef): void {
		setting.setName(nameOf(topic));
		setting.setDesc(this.describeTopic(topic));

		setting.addText((text) => {
			text.setPlaceholder('Code')
				.setValue(topic.code)
				.onChange((value) => {
					topic.code = value.trim();
					setting.setName(nameOf(topic));
					setting.setDesc(this.describeTopic(topic));
					void this.plugin.saveSettings();
				});
		});
		setting.addText((text) => {
			text.setPlaceholder('Folder, or Folder/Note.md')
				.setValue(topic.path)
				.onChange((value) => {
					topic.path = value.trim();
					setting.setDesc(this.describeTopic(topic));
					void this.plugin.saveSettings();
				});
		});
		setting.addToggle((toggle) => {
			toggle
				.setTooltip('Commands of its own')
				.setValue(topic.commands)
				.onChange((value) => {
					topic.commands = value;
					setting.setDesc(this.describeTopic(topic));
					void this.plugin.saveSettings();
				});
		});
		setting.addExtraButton((button) => {
			button
				.setIcon('x')
				.setTooltip('Remove topic')
				.onClick(() => {
					void this.remove(topic);
				});
		});
	}

	private describeTopic(topic: TopicRef): DocumentFragment {
		const target = describeTarget(this.plugin.app, topic.path);
		const duplicate = this.isDuplicate(topic);

		return createFragment((fragment) => {
			fragment.createDiv({
				cls: target.ok ? 'msxd-status' : 'msxd-status is-error',
				text: target.text,
			});
			if (duplicate) {
				fragment.createDiv({
					cls: 'msxd-status is-error',
					text: 'Another topic already uses this code, and the first one wins.',
				});
			}

			const commands = describeCommands(
				topic,
				this.plugin.settings.commands.topics,
			);
			fragment.createDiv({
				cls: commands.ok ? 'msxd-status' : 'msxd-status is-error',
				text: commands.text,
			});
		});
	}

	/** Codes are matched ignoring case, so a case-only difference still clashes. */
	private isDuplicate(topic: TopicRef): boolean {
		const code = topic.code.toLowerCase();
		if (code.length === 0) return false;
		return this.plugin.settings.commands.topics.some(
			(other) => other.id !== topic.id && other.code.toLowerCase() === code,
		);
	}

	private async add(): Promise<void> {
		this.plugin.settings.commands.topics.push(createTopic());
		await this.plugin.saveSettings();
		this.renderSection();
	}

	private async remove(topic: TopicRef): Promise<void> {
		const { commands } = this.plugin.settings;
		commands.topics = commands.topics.filter((item) => item.id !== topic.id);
		await this.plugin.saveSettings();
		this.renderSection();
	}
}

function nameOf(topic: TopicRef): string {
	return topic.code.length > 0 ? topic.code : 'New topic';
}

/** The commands this topic answers to, or why it has none. */
function describeCommands(
	topic: TopicRef,
	topics: readonly TopicRef[],
): { ok: boolean; text: string } {
	if (!topic.commands) {
		return {
			ok: true,
			text: 'No commands of its own. Ask for it as /tasks 3 code.',
		};
	}
	if (topic.code.length === 0) {
		return { ok: true, text: 'Give it a code to get commands of its own.' };
	}
	if (isReservedCommand(topic.code)) {
		return {
			ok: false,
			text: 'This name belongs to the bot itself, so the topic gets no commands.',
		};
	}
	if (!isCommandName(topic.code)) {
		return {
			ok: false,
			text: 'A command name takes only a\u2013z, 0\u20139 and _, so this code gets none.',
		};
	}
	// A range of this topic can collide with another topic's own code, and the
	// whole name wins, so the row must not promise what it will not get.
	const taken = new Set(
		topics
			.filter((other) => other.id !== topic.id && hasTopicCommands(other))
			.map((other) => other.code.toLowerCase()),
	);
	const own: string[] = [];
	const lost: string[] = [];
	for (const { name, ahead } of topicCommands(topic)) {
		(ahead !== null && taken.has(name) ? lost : own).push(`/${name}`);
	}

	const answers = `Answers to ${own.join(', ')}.`;
	return lost.length > 0
		? {
				ok: false,
				text: `${answers} ${lost.join(', ')} belongs to another topic of that name.`,
			}
		: { ok: true, text: answers };
}

/** What the path points at right now, so a typo shows up before a command does. */
function describeTarget(
	app: App,
	path: string,
): { ok: boolean; text: string } {
	if (path.length === 0) {
		return { ok: false, text: 'Name the folder or note this topic covers.' };
	}

	const target = app.vault.getAbstractFileByPath(normalizePath(path));
	if (target instanceof TFolder) {
		return { ok: true, text: 'Folder: every note inside it is searched.' };
	}
	if (target instanceof TFile) {
		return target.extension === 'md'
			? { ok: true, text: 'Note: only this file is searched.' }
			: { ok: false, text: 'Not a note, so there is nothing to search.' };
	}
	return { ok: false, text: 'Nothing in the vault sits at this path.' };
}
