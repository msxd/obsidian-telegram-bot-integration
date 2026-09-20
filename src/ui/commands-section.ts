import { App, normalizePath, Setting, SettingGroup, TFile, TFolder } from 'obsidian';
import type MSXDAllInOnePlugin from '../main';
import { createTopic, TopicRef } from '../settings';
import { replaceGroups, SettingsSection } from './section';

/** Topics: the named folders and notes bot commands can be pointed at. */
export class CommandsSection implements SettingsSection {
	private readonly plugin: MSXDAllInOnePlugin;
	private parentEl: HTMLElement | null = null;
	private groupEls: Element[] = [];

	constructor(plugin: MSXDAllInOnePlugin) {
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
				text: 'From an allowed chat: /tasks for what is due today, /tasks 3 for the next three days, /tasks 3 code for a topic, and /topics for the list of codes.',
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
	 * One row: the code, the path, and what that path currently points at.
	 * Typing only saves, never redraws: a redraw would rebuild the input and
	 * take the focus away mid-word.
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
