import {
	ButtonComponent,
	ExtraButtonComponent,
	Notice,
	Setting,
	SettingGroup,
	TextComponent,
} from 'obsidian';
import { buildCommandHints, MAX_COMMANDS } from '../commands/hints';
import type MSXDAllInOnePlugin from '../main';
import {
	getMe,
	isWellFormedToken,
	redactToken,
	setMyCommands,
	TelegramApiError,
} from '../telegram/api';
import { SettingsSection } from './section';

type TokenStatus =
	| { kind: 'unknown' }
	| { kind: 'checking' }
	| { kind: 'ok'; username: string; fresh: boolean }
	| { kind: 'error'; message: string };

/** Whether the command menu in Telegram has been refreshed this session. */
type HintsStatus =
	| { kind: 'unknown' }
	| { kind: 'sending' }
	| { kind: 'ok'; count: number }
	| { kind: 'error'; message: string };

const TOKEN_PLACEHOLDER = '123456789:AAF-abc...';

export class TokenSection implements SettingsSection {
	private readonly plugin: MSXDAllInOnePlugin;
	private status: TokenStatus = { kind: 'unknown' };
	private statusEl: HTMLElement | null = null;
	private tokenInput: TextComponent | null = null;
	private hintsStatus: HintsStatus = { kind: 'unknown' };
	private hintsStatusEl: HTMLElement | null = null;

	constructor(plugin: MSXDAllInOnePlugin) {
		this.plugin = plugin;
	}

	render(containerEl: HTMLElement): void {
		const { botUsername } = this.plugin.settings.telegram;
		this.status =
			botUsername.length > 0
				? { kind: 'ok', username: botUsername, fresh: false }
				: { kind: 'unknown' };

		this.hintsStatus = { kind: 'unknown' };

		new SettingGroup(containerEl)
			.setHeading('Telegram')
			.addSetting((setting) => {
				this.buildTokenSetting(setting);
			})
			.addSetting((setting) => {
				this.buildHintsSetting(setting);
			});
	}

	dispose(): void {
		this.statusEl = null;
		this.tokenInput = null;
		this.hintsStatusEl = null;
	}

	private buildTokenSetting(setting: Setting): void {
		setting.setName('Bot token').setDesc(this.buildDescription());

		setting.addText((text) => {
			this.tokenInput = text;
			text.inputEl.type = 'password';
			text.inputEl.autocomplete = 'off';
			text.inputEl.spellcheck = false;
			text.setPlaceholder(TOKEN_PLACEHOLDER)
				.setValue(this.plugin.settings.telegram.botToken)
				.onChange(async (value) => {
					await this.updateToken(value);
				});
		});

		setting.addExtraButton((button) => {
			button
				.setIcon('eye')
				.setTooltip('Show token')
				.onClick(() => {
					this.toggleTokenVisibility(button);
				});
		});

		setting.addButton((button) => {
			button
				.setButtonText('Check token')
				.setCta()
				.onClick(async () => {
					await this.checkToken(button);
				});
		});
	}

	private buildHintsSetting(setting: Setting): void {
		setting
			.setName('Command hints')
			.setDesc(this.buildHintsDescription())
			.addButton((button) => {
				button
					.setButtonText('Update commands')
					.onClick(async () => {
						await this.updateHints(button);
					});
			});
	}

	private buildHintsDescription(): DocumentFragment {
		return createFragment((fragment) => {
			fragment.createDiv({
				text: 'Registers the bot\u2019s commands with Telegram, so the chat suggests them while typing: /tasks and /topics, the ready-made ranges, and one set per topic. Send the list again whenever the commands or the topics change.',
			});
			fragment.createDiv({
				text: 'The menu is public: anyone who finds the bot sees it, and only allowed chats get an answer.',
			});
			this.hintsStatusEl = fragment.createDiv({ cls: 'msxd-status' });
			this.renderHintsStatus();
		});
	}

	private buildDescription(): DocumentFragment {
		return createFragment((fragment) => {
			fragment.createDiv({
				text: 'Create a bot with @BotFather and paste its token here. The token is stored in this plugin’s data.json inside the vault, so treat the vault as secret.',
			});
			this.statusEl = fragment.createDiv({ cls: 'msxd-status' });
			this.renderStatus();
		});
	}

	private async updateToken(value: string): Promise<void> {
		const { telegram } = this.plugin.settings;
		telegram.botToken = value.trim();
		// The cached username belongs to the previous token.
		telegram.botUsername = '';
		this.setStatus({ kind: 'unknown' });
		await this.plugin.saveSettings();
	}

	/** What is wrong with the token before a call is worth making, if anything. */
	private tokenProblem(): string | null {
		const token = this.plugin.settings.telegram.botToken;
		if (token.length === 0) return 'Enter a bot token first.';
		if (!isWellFormedToken(token)) {
			return `This does not look like a bot token. Expected ${TOKEN_PLACEHOLDER}`;
		}
		return null;
	}

	private async checkToken(button: ButtonComponent): Promise<void> {
		const problem = this.tokenProblem();
		if (problem !== null) {
			this.setStatus({ kind: 'error', message: problem });
			return;
		}

		const token = this.plugin.settings.telegram.botToken;
		button.setDisabled(true);
		this.setStatus({ kind: 'checking' });
		try {
			const bot = await getMe(token);
			this.plugin.settings.telegram.botUsername = bot.username;
			await this.plugin.saveSettings();
			this.setStatus({
				kind: 'ok',
				username: bot.username,
				fresh: true,
			});
			new Notice(`Connected to @${bot.username}`);
		} catch (error) {
			const message = describeFailure(error, token, 'check the token');
			this.plugin.settings.telegram.botUsername = '';
			await this.plugin.saveSettings();
			this.setStatus({ kind: 'error', message });
			new Notice(message);
		} finally {
			button.setDisabled(false);
		}
	}

	private async updateHints(button: ButtonComponent): Promise<void> {
		const problem = this.tokenProblem();
		if (problem !== null) {
			this.setHintsStatus({ kind: 'error', message: problem });
			return;
		}

		const hints = buildCommandHints(this.plugin.settings.commands.topics);
		if (hints.length > MAX_COMMANDS) {
			this.setHintsStatus({
				kind: 'error',
				message: `Telegram takes at most ${String(MAX_COMMANDS)} commands, and there are ${String(hints.length)}. Turn commands off for some topics.`,
			});
			return;
		}

		const token = this.plugin.settings.telegram.botToken;
		button.setDisabled(true);
		this.setHintsStatus({ kind: 'sending' });
		try {
			await setMyCommands(token, hints);
			this.setHintsStatus({ kind: 'ok', count: hints.length });
			new Notice(`Telegram now suggests ${String(hints.length)} commands`);
		} catch (error) {
			const message = describeFailure(error, token, 'update the commands');
			this.setHintsStatus({ kind: 'error', message });
			new Notice(message);
		} finally {
			button.setDisabled(false);
		}
	}

	private toggleTokenVisibility(button: ExtraButtonComponent): void {
		const input = this.tokenInput?.inputEl;
		if (!input) return;
		const reveal = input.type === 'password';
		input.type = reveal ? 'text' : 'password';
		button
			.setIcon(reveal ? 'eye-off' : 'eye')
			.setTooltip(reveal ? 'Hide token' : 'Show token');
	}

	private setStatus(status: TokenStatus): void {
		this.status = status;
		this.renderStatus();
	}

	private renderStatus(): void {
		const el = this.statusEl;
		if (!el) return;
		el.setText(describeStatus(this.status));
		el.toggleClass('is-ok', this.status.kind === 'ok');
		el.toggleClass('is-error', this.status.kind === 'error');
	}

	private setHintsStatus(status: HintsStatus): void {
		this.hintsStatus = status;
		this.renderHintsStatus();
	}

	private renderHintsStatus(): void {
		const el = this.hintsStatusEl;
		if (!el) return;
		el.setText(describeHintsStatus(this.hintsStatus));
		el.toggleClass('is-ok', this.hintsStatus.kind === 'ok');
		el.toggleClass('is-error', this.hintsStatus.kind === 'error');
	}
}

function describeFailure(
	error: unknown,
	token: string,
	action: string,
): string {
	return error instanceof TelegramApiError
		? error.message
		: redactToken(`Could not ${action}: ${String(error)}`, token);
}

function describeHintsStatus(status: HintsStatus): string {
	switch (status.kind) {
		case 'unknown':
			return 'Not sent in this session.';
		case 'sending':
			return 'Sending…';
		case 'ok':
			return `Telegram has the current list of ${String(status.count)} commands.`;
		case 'error':
			return status.message;
	}
}

function describeStatus(status: TokenStatus): string {
	switch (status.kind) {
		case 'unknown':
			return 'Not checked yet.';
		case 'checking':
			return 'Checking…';
		case 'ok':
			return status.fresh
				? `Token works — connected to @${status.username}.`
				: `Last successful check: @${status.username}.`;
		case 'error':
			return status.message;
	}
}
