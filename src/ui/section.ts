/** One settings group that owns its own rendering and transient state. */
export interface SettingsSection {
	render(containerEl: HTMLElement): void;
	/** Drops references to DOM that the settings tab is about to throw away. */
	dispose(): void;
}
