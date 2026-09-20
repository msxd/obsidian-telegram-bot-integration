import { SettingGroup } from 'obsidian';
import type MSXDTelegramPlugin from '../main';
import { IntakeStatus } from '../intake/service';
import { ALLOWED_REACTIONS } from '../telegram/reactions';
import { replaceGroups, SettingsSection } from './section';

export class IntakeSection implements SettingsSection {
	private readonly plugin: MSXDTelegramPlugin;
	private parentEl: HTMLElement | null = null;
	private groupEls: Element[] = [];
	private unsubscribe: (() => void) | null = null;

	constructor(plugin: MSXDTelegramPlugin) {
		this.plugin = plugin;
	}

	render(containerEl: HTMLElement): void {
		this.parentEl = containerEl;
		this.groupEls = [];
		this.unsubscribe = this.plugin.intake.onChange(() => {
			this.renderSection();
		});
		this.renderSection();
	}

	dispose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.parentEl = null;
		this.groupEls = [];
	}

	private renderSection(): void {
		const parent = this.parentEl;
		if (!parent) return;
		this.groupEls = replaceGroups(parent, this.groupEls, (containerEl) => {
			this.renderToggle(containerEl);
		});
	}

	private renderToggle(containerEl: HTMLElement): void {
		new SettingGroup(containerEl)
			.setHeading('Receiving')
			.addSetting((setting) => {
				setting
					.setName('Receive messages')
					.setDesc(this.buildStatus())
					.addToggle((toggle) => {
						toggle
							.setValue(this.plugin.settings.intake.enabled)
							.onChange((value) => {
								void this.setEnabled(value);
							});
					});
			})
			.addSetting((setting) => {
				setting
					.setName('Reaction')
					.setDesc(
						'Emoji the bot puts on a message once it has been saved, so the chat shows what got through. Telegram allows only this set.',
					)
					.addDropdown((dropdown) => {
						dropdown.addOption('', 'None');
						for (const emoji of ALLOWED_REACTIONS) {
							dropdown.addOption(emoji, emoji);
						}
						dropdown
							.setValue(this.plugin.settings.intake.reaction)
							.onChange((value) => {
								this.plugin.settings.intake.reaction = value;
								void this.plugin.saveSettings();
							});
					});
			});
	}

	private buildStatus(): DocumentFragment {
		const { intake } = this.plugin;
		const status = intake.getStatus();

		return createFragment((fragment) => {
			fragment.createDiv({
				text: 'Listens for messages and files them by the rules above.',
			});

			fragment.createDiv({
				cls: `msxd-status${statusModifier(status)}`,
				text: describeStatus(status),
			});

			const filed = intake.getFiledCount();
			const skipped = intake.getSkippedCount();
			const answered = intake.getAnsweredCount();
			if (filed > 0 || skipped > 0 || answered > 0) {
				fragment.createDiv({
					cls: 'msxd-status',
					text: describeCounts(
						filed,
						skipped,
						answered,
						intake.getLastPath(),
					),
				});
			}

			for (const warning of this.collectWarnings()) {
				fragment.createDiv({
					cls: 'msxd-status is-error',
					text: warning,
				});
			}
		});
	}

	/** Reasons the toggle would do nothing useful if switched on. */
	private collectWarnings(): string[] {
		const { telegram } = this.plugin.settings;
		const warnings: string[] = [];
		if (telegram.botToken.length === 0) {
			warnings.push('No bot token set, so there is nothing to listen to.');
		}
		if (telegram.allowedChats.length === 0) {
			warnings.push(
				'No chats are allowed yet, so every message will be ignored.',
			);
		}
		return warnings;
	}

	private async setEnabled(enabled: boolean): Promise<void> {
		this.plugin.settings.intake.enabled = enabled;
		await this.plugin.saveSettings();
		if (enabled) {
			this.plugin.intake.start();
		} else {
			this.plugin.intake.stop();
		}
	}
}

function describeStatus(status: IntakeStatus): string {
	switch (status.kind) {
		case 'stopped':
			return 'Not listening.';
		case 'listening':
			return 'Listening for messages.';
		case 'error':
			return status.message;
	}
}

function statusModifier(status: IntakeStatus): string {
	switch (status.kind) {
		case 'listening':
			return ' is-ok';
		case 'error':
			return ' is-error';
		case 'stopped':
			return '';
	}
}

function describeCounts(
	filed: number,
	skipped: number,
	answered: number,
	lastPath: string,
): string {
	const parts = [`Saved ${String(filed)} so far`];
	if (lastPath.length > 0) parts.push(`last one to ${lastPath}`);
	if (skipped > 0) {
		parts.push(
			`${String(skipped)} skipped for having nothing to save`,
		);
	}
	if (answered > 0) {
		parts.push(`${String(answered)} commands answered`);
	}
	return `${parts.join(', ')}.`;
}
