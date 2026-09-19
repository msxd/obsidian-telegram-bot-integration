import { Plugin } from 'obsidian';
import { MsxdPluginSettings, mergeSettings } from './settings';
import { MSXDPluginSettingTab } from './ui/settings-tab';

export default class MSXDAllInOnePlugin extends Plugin {
	settings!: MsxdPluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MSXDPluginSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
