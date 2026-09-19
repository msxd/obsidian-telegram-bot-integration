import { App, PluginSettingTab } from 'obsidian';
import type MSXDAllInOnePlugin from '../main';
import { AllowedChatsSection } from './allowed-chats-section';
import { InboxSection } from './inbox-section';
import { SettingsSection } from './section';
import { TokenSection } from './token-section';

export class MSXDPluginSettingTab extends PluginSettingTab {
	private readonly sections: SettingsSection[];

	constructor(app: App, plugin: MSXDAllInOnePlugin) {
		super(app, plugin);
		this.sections = [
			new TokenSection(plugin),
			new AllowedChatsSection(plugin),
			new InboxSection(plugin),
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const section of this.sections) {
			section.render(containerEl);
		}
	}

	hide(): void {
		for (const section of this.sections) {
			section.dispose();
		}
		super.hide();
	}
}
