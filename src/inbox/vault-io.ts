import { Vault } from 'obsidian';

/** Creates each level in turn, since `createFolder` does not promise parents. */
export async function ensureFolder(vault: Vault, folder: string): Promise<void> {
	if (folder.length === 0) return;

	let current = '';
	for (const segment of folder.split('/')) {
		current = current.length === 0 ? segment : `${current}/${segment}`;
		if (vault.getAbstractFileByPath(current) !== null) continue;
		try {
			await vault.createFolder(current);
		} catch (error) {
			// Fine if something else got there first; anything else is real.
			if (vault.getAbstractFileByPath(current) === null) throw error;
		}
	}
}

/**
 * Adds a numeric suffix until the path is free. Two photos sent a second apart
 * can arrive with the same name, and an attachment must never overwrite a file
 * already in the vault.
 */
export function uniquePath(vault: Vault, path: string): string {
	if (vault.getAbstractFileByPath(path) === null) return path;

	const dot = path.lastIndexOf('.');
	const slash = path.lastIndexOf('/');
	const hasExtension = dot > slash;
	const stem = hasExtension ? path.slice(0, dot) : path;
	const extension = hasExtension ? path.slice(dot) : '';

	for (let suffix = 1; suffix < 1000; suffix++) {
		const candidate = `${stem} ${String(suffix)}${extension}`;
		if (vault.getAbstractFileByPath(candidate) === null) return candidate;
	}
	return `${stem} ${String(Date.now())}${extension}`;
}

export function parentFolder(path: string): string {
	const index = path.lastIndexOf('/');
	return index < 0 ? '' : path.slice(0, index);
}
