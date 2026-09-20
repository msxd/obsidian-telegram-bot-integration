import { Plugin } from 'obsidian';
import { IntakeService } from './intake/service';
import { MsxdPluginSettings, mergeSettings } from './settings';
import { MSXDPluginSettingTab } from './ui/settings-tab';

export default class MSXDTelegramPlugin extends Plugin {
	settings!: MsxdPluginSettings;
	intake!: IntakeService;

	async onload() {
		await this.loadSettings();
		this.intake = new IntakeService(this);
		this.addSettingTab(new MSXDPluginSettingTab(this.app, this));
		// Starts its own loop without blocking onload.
		if (this.settings.intake.enabled) this.intake.start();
	}

	onunload() {
		this.intake.stop();
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
