/** One settings group that owns its own rendering and transient state. */
export interface SettingsSection {
	render(containerEl: HTMLElement): void;
	/** Drops references to DOM that the settings tab is about to throw away. */
	dispose(): void;
}

/**
 * Rebuilds a section's groups and swaps them in where the old ones stood.
 *
 * The groups are built detached and then inserted as direct children of the
 * tab: Obsidian spaces setting groups by their position among siblings, so
 * keeping them inside a wrapper element would leave the first group without
 * its top margin.
 *
 * @param previous the elements from the last call, empty on the first one
 * @returns the elements now on screen, to pass back on the next call
 */
export function replaceGroups(
	parentEl: HTMLElement,
	previous: readonly Element[],
	build: (containerEl: HTMLElement) => void,
): Element[] {
	const staging = createDiv();
	build(staging);

	const replacement = Array.from(staging.children);
	const anchor = previous[0] ?? null;
	for (const el of replacement) {
		parentEl.insertBefore(el, anchor);
	}
	for (const el of previous) {
		el.detach();
	}
	return replacement;
}
