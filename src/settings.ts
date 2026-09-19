export interface TelegramSettings {
	/** Bot token from @BotFather. Stored as plain text in the plugin's data.json. */
	botToken: string;
	/** Username of the bot from the last successful token check, without the `@`. */
	botUsername: string;
}

export interface MsxdPluginSettings {
	telegram: TelegramSettings;
}

export const DEFAULT_SETTINGS: MsxdPluginSettings = {
	telegram: {
		botToken: '',
		botUsername: '',
	},
};

/**
 * Merges stored data with the defaults one section at a time, so a section
 * saved before a new field existed still gets that field's default.
 */
export function mergeSettings(data: unknown): MsxdPluginSettings {
	const stored = (data ?? {}) as Partial<MsxdPluginSettings>;
	return {
		telegram: { ...DEFAULT_SETTINGS.telegram, ...stored.telegram },
	};
}
