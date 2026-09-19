import { Setting, SettingGroup } from 'obsidian';
import { describeFilter, parseFilter } from '../inbox/filter';
import type MSXDAllInOnePlugin from '../main';
import {
	createRule,
	DEFAULT_HEADING,
	DEFAULT_INBOX_FOLDER,
	DEFAULT_MEDIA_FOLDER,
	DEFAULT_NOTE_NAME,
	MessageRule,
} from '../settings';
import { FolderSuggest } from './folder-suggest';
import { RuleModal } from './rule-modal';
import { replaceGroups, SettingsSection } from './section';

export class InboxSection implements SettingsSection {
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
			this.renderIntake(containerEl);
			this.renderRules(containerEl);
		});
	}

	private renderIntake(containerEl: HTMLElement): void {
		const { inbox } = this.plugin.settings;

		new SettingGroup(containerEl)
			.setHeading('Message intake')
			.addSetting((setting) => {
				setting
					.setName('Inbox folder')
					.setDesc('Where messages go when no rule claims them.')
					.addText((text) => {
						text.setPlaceholder(DEFAULT_INBOX_FOLDER).setValue(
							inbox.folder,
						);
						const suggest = new FolderSuggest(
							this.plugin.app,
							text.inputEl,
						);
						// Picking a suggestion sets the input directly, so it has
						// to save on its own; typing goes through onChange.
						suggest.onSelect((folder) => {
							suggest.setValue(folder.path);
							suggest.close();
							inbox.folder = folder.path;
							void this.plugin.saveSettings();
						});
						text.onChange((value) => {
							inbox.folder = value.trim();
							void this.plugin.saveSettings();
						});
					});
			})
			.addSetting((setting) => {
				setting.settingEl.addClass('msxd-template-setting');
				setting
					.setName('Note name')
					.setDesc(
						'Used whenever a path points at a folder. Takes the same variables as a rule path.',
					)
					.addTextArea((text) => {
						text.inputEl.addClass('msxd-template-input');
						text.setPlaceholder(DEFAULT_NOTE_NAME)
							.setValue(inbox.noteNameTemplate)
							.onChange((value) => {
								inbox.noteNameTemplate = value;
								void this.plugin.saveSettings();
							});
					});
			})
			.addSetting((setting) => {
				setting.settingEl.addClass('msxd-template-setting');
				setting
					.setName('Default heading')
					.setDesc(
						'Written before messages that fall through to the inbox folder. Takes the same variables as a rule path, and line breaks are kept.',
					)
					.addTextArea((text) => {
						text.inputEl.addClass('msxd-template-input');
						text.setPlaceholder(DEFAULT_HEADING)
							.setValue(inbox.defaultHeading)
							.onChange((value) => {
								inbox.defaultHeading = value;
								void this.plugin.saveSettings();
							});
					});
			})
			.addSetting((setting) => {
				setting
					.setName('Media folder')
					.setDesc(
						'Where attachments go when a rule does not name its own folder.',
					)
					.addText((text) => {
						text.setPlaceholder(DEFAULT_MEDIA_FOLDER).setValue(
							inbox.mediaFolder,
						);
						const suggest = new FolderSuggest(
							this.plugin.app,
							text.inputEl,
						);
						suggest.onSelect((folder) => {
							suggest.setValue(folder.path);
							suggest.close();
							inbox.mediaFolder = folder.path;
							void this.plugin.saveSettings();
						});
						text.onChange((value) => {
							inbox.mediaFolder = value.trim();
							void this.plugin.saveSettings();
						});
					});
			})
			.addSetting((setting) => {
				setting
					.setName('Separate messages')
					.setDesc(
						'Put a horizontal rule before a message added to a note that already has content.',
					)
					.addToggle((toggle) => {
						toggle
							.setValue(inbox.separateMessages)
							.onChange((value) => {
								inbox.separateMessages = value;
								void this.plugin.saveSettings();
							});
					});
			});
	}

	private renderRules(containerEl: HTMLElement): void {
		const { rules } = this.plugin.settings.inbox;
		const group = new SettingGroup(containerEl).setHeading('Rules');

		group.addSetting((setting) => {
			setting
				.setName('Routing rules')
				.setDesc(
					'Checked top to bottom, and the first match wins. A message no rule claims goes to the inbox folder.',
				)
				.addButton((button) => {
					button
						.setButtonText('Add rule')
						.setCta()
						.onClick(() => {
							this.addRule();
						});
				});
		});

		rules.forEach((rule, index) => {
			group.addSetting((setting) => {
				this.buildRuleSetting(setting, rule, index);
			});
		});
	}

	private buildRuleSetting(
		setting: Setting,
		rule: MessageRule,
		index: number,
	): void {
		const { rules } = this.plugin.settings.inbox;
		const parsed = parseFilter(rule.filter);

		setting
			.setName(parsed.ok ? describeFilter(parsed.filter) : 'Broken filter')
			.setDesc(
				createFragment((fragment) => {
					fragment.createDiv({
						cls: 'msxd-rule-path',
						text:
							rule.path.length > 0
								? rule.path
								: 'No path set, messages would go to the inbox folder.',
					});
					if (!parsed.ok) {
						fragment.createDiv({
							cls: 'msxd-status is-error',
							text: parsed.error,
						});
					}
				}),
			);

		setting.addExtraButton((button) => {
			button
				.setIcon('arrow-up')
				.setTooltip('Move up')
				.setDisabled(index === 0)
				.onClick(() => {
					void this.move(index, -1);
				});
		});
		setting.addExtraButton((button) => {
			button
				.setIcon('arrow-down')
				.setTooltip('Move down')
				.setDisabled(index === rules.length - 1)
				.onClick(() => {
					void this.move(index, 1);
				});
		});
		setting.addExtraButton((button) => {
			button
				.setIcon('pencil')
				.setTooltip('Edit rule')
				.onClick(() => {
					this.editRule(rule);
				});
		});
		setting.addExtraButton((button) => {
			button
				.setIcon('x')
				.setTooltip('Remove rule')
				.onClick(() => {
					void this.update(() => {
						const { inbox } = this.plugin.settings;
						inbox.rules = inbox.rules.filter(
							(item) => item.id !== rule.id,
						);
					});
				});
		});
	}

	private addRule(): void {
		const { inbox } = this.plugin.settings;
		new RuleModal(
			this.plugin.app,
			inbox,
			createRule(),
			'New rule',
			(saved) => {
				void this.update(() => {
					inbox.rules.push(saved);
				});
			},
		).open();
	}

	private editRule(rule: MessageRule): void {
		const { inbox } = this.plugin.settings;
		new RuleModal(this.plugin.app, inbox, rule, 'Edit rule', (saved) => {
			void this.update(() => {
				const index = inbox.rules.findIndex(
					(item) => item.id === saved.id,
				);
				if (index >= 0) inbox.rules[index] = saved;
			});
		}).open();
	}

	private async move(index: number, delta: number): Promise<void> {
		const { rules } = this.plugin.settings.inbox;
		const moved = rules[index];
		const other = rules[index + delta];
		if (moved === undefined || other === undefined) return;
		await this.update(() => {
			rules[index] = other;
			rules[index + delta] = moved;
		});
	}

	/**
	 * Applies a change to the rule list, persists it and redraws the section.
	 *
	 * Only for changes that alter the list itself. Text fields save without a
	 * redraw, which would rebuild the input and drop focus on every keystroke.
	 */
	private async update(change: () => void): Promise<void> {
		change();
		await this.plugin.saveSettings();
		this.renderSection();
	}
}
