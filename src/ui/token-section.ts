import {
	ButtonComponent,
	ExtraButtonComponent,
	Notice,
	Setting,
	SettingGroup,
	TextComponent,
} from 'obsidian';
import type MSXDAllInOnePlugin from '../main';
import {
	getMe,
	isWellFormedToken,
	redactToken,
	TelegramApiError,
} from '../telegram/api';
import { SettingsSection } from './section';

type TokenStatus =
	| { kind: 'unknown' }
	| { kind: 'checking' }
	| { kind: 'ok'; username: string; fresh: boolean }
	| { kind: 'error'; message: string };

const TOKEN_PLACEHOLDER = '123456789:AAF-abc...';

export class TokenSection implements SettingsSection {
	private readonly plugin: MSXDAllInOnePlugin;
	private status: TokenStatus = { kind: 'unknown' };
	private statusEl: HTMLElement | null = null;
	private tokenInput: TextComponent | null = null;

	constructor(plugin: MSXDAllInOnePlugin) {
		this.plugin = plugin;
	}

	render(containerEl: HTMLElement): void {
		const { botUsername } = this.plugin.settings.telegram;
		this.status =
			botUsername.length > 0
				? { kind: 'ok', username: botUsername, fresh: false }
				: { kind: 'unknown' };

		new SettingGroup(containerEl)
			.setHeading('Telegram')
			.addSetting((setting) => {
				this.buildTokenSetting(setting);
			});
	}

	dispose(): void {
		this.statusEl = null;
		this.tokenInput = null;
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

	private async checkToken(button: ButtonComponent): Promise<void> {
		const token = this.plugin.settings.telegram.botToken;
		if (token.length === 0) {
			this.setStatus({
				kind: 'error',
				message: 'Enter a bot token first.',
			});
			return;
		}
		if (!isWellFormedToken(token)) {
			this.setStatus({
				kind: 'error',
				message: `This does not look like a bot token. Expected ${TOKEN_PLACEHOLDER}`,
			});
			return;
		}

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
			const message =
				error instanceof TelegramApiError
					? error.message
					: redactToken(
							`Could not check the token: ${String(error)}`,
							token,
						);
			this.plugin.settings.telegram.botUsername = '';
			await this.plugin.saveSettings();
			this.setStatus({ kind: 'error', message });
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
