import { TFile, Vault } from 'obsidian';
import { IncomingMessage } from './message';
import { RoutingTarget } from './routing';
import { ensureFolder, parentFolder } from './vault-io';

/** Markdown horizontal rule, used to separate appended messages. */
const RULE = '---';

export interface WriteOptions {
	/** Markdown embeds for the attachments already saved to the vault. */
	links?: string[];
	/** Put a horizontal rule before a message appended to an existing note. */
	separate?: boolean;
}

/**
 * Writes a message to the note the routing decided on, creating any missing
 * folders. An existing note is appended to, so a path like
 * `Journal/2026-09.md` collects a month of messages in one file.
 *
 */
export async function writeMessage(
	vault: Vault,
	target: RoutingTarget,
	message: IncomingMessage,
	options: WriteOptions = {},
): Promise<void> {
	const separate = options.separate === true;
	const block = buildBlock(target.heading, message.text, options.links ?? []);

	const existing = vault.getFileByPath(target.path);
	if (existing !== null) {
		await appendBlock(vault, existing, block, separate);
		return;
	}

	await ensureFolder(vault, parentFolder(target.path));
	try {
		// A brand new note has nothing above it to separate from.
		await vault.create(target.path, block);
	} catch (error) {
		// The note may have appeared between the lookup and the create.
		const created = vault.getFileByPath(target.path);
		if (created === null) throw error;
		await appendBlock(vault, created, block, separate);
	}
}

function buildBlock(
	heading: string,
	text: string,
	links: string[],
): string {
	const parts: string[] = [];

	const title = heading.trim();
	if (title.length > 0) parts.push(title);
	// Attachments go above the caption, the way they read in Telegram.
	if (links.length > 0) parts.push(links.join('\n'));
	const body = text.trim();
	if (body.length > 0) parts.push(body);

	return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
}

/** Appends through `process` so a concurrent write cannot clobber the note. */
async function appendBlock(
	vault: Vault,
	file: TFile,
	block: string,
	separate: boolean,
): Promise<void> {
	await vault.process(file, (data) => {
		// An empty note has nothing above to separate from.
		const rule = separate && data.trim().length > 0 ? `${RULE}\n\n` : '';
		return `${data}${separatorFor(data)}${rule}${block}`;
	});
}

function separatorFor(data: string): string {
	if (data.length === 0 || data.endsWith('\n\n')) return '';
	return data.endsWith('\n') ? '\n' : '\n\n';
}
