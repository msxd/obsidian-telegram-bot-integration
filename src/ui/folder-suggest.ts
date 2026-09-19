import { AbstractInputSuggest, TFolder } from 'obsidian';

/** Suggests vault folders while typing a folder path. */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	protected getSuggestions(query: string): TFolder[] {
		const wanted = query.toLowerCase();
		return this.app.vault
			.getAllFolders(true)
			.filter((folder) => folder.path.toLowerCase().includes(wanted));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		// The vault root has an empty path.
		el.setText(folder.path.length > 0 ? folder.path : '/');
	}
}
