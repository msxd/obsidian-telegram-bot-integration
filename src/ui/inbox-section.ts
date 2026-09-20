import { Setting, SettingGroup } from 'obsidian';
import { describeFilter, parseFilter } from '../inbox/filter';
import type MSXDAllInOnePlugin from '../main';
import { createRule, MessageRule } from '../settings';
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
			this.renderRules(containerEl);
		});
	}

	private renderRules(containerEl: HTMLElement): void {
		const { inbox } = this.plugin.settings;
		const group = new SettingGroup(containerEl).setHeading('Rules');

		group.addSetting((setting) => {
			setting
				.setName('Routing rules')
				.setDesc(
					'Checked top to bottom, and the first match wins. Anything no rule claims goes to the last one, which cannot be removed.',
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

		inbox.rules.forEach((rule, index) => {
			group.addSetting((setting) => {
				this.buildRuleSetting(setting, rule, index);
			});
		});

		group.addSetting((setting) => {
			this.buildFallbackSetting(setting);
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
			.setDesc(describeRule(rule, parsed.ok ? '' : parsed.error));

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

	/** The last row: no filter to show, and no way to move or remove it. */
	private buildFallbackSetting(setting: Setting): void {
		const { fallback } = this.plugin.settings.inbox;
		setting
			.setName('Everything else')
			.setDesc(describeRule(fallback, ''))
			.addExtraButton((button) => {
				button
					.setIcon('pencil')
					.setTooltip('Edit the default rule')
					.onClick(() => {
						this.editRule(fallback);
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
		const title =
			rule.id === inbox.fallback.id ? 'Default rule' : 'Edit rule';
		new RuleModal(this.plugin.app, inbox, rule, title, (saved) => {
			void this.update(() => {
				if (saved.id === inbox.fallback.id) {
					inbox.fallback = saved;
					return;
				}
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

	/** Applies a change to the rules, persists it and redraws the section. */
	private async update(change: () => void): Promise<void> {
		change();
		await this.plugin.saveSettings();
		this.renderSection();
	}
}

function describeRule(rule: MessageRule, error: string): DocumentFragment {
	return createFragment((fragment) => {
		fragment.createDiv({
			cls: 'msxd-rule-path',
			text:
				rule.path.length > 0
					? rule.path
					: 'No path set, messages would go to the default rule.',
		});
		if (rule.separate) {
			fragment.createDiv({ text: 'Separated by a horizontal rule' });
		}
		if (error.length > 0) {
			fragment.createDiv({ cls: 'msxd-status is-error', text: error });
		}
	});
}
