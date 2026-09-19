import { TFile, Vault } from 'obsidian';
import { Attachment, AttachmentKind, IncomingMessage } from './message';
import { sanitizeForFileName } from './template';
import { ensureFolder, uniquePath } from './vault-io';

/** What to call a file Telegram did not name, by the field it arrived in. */
const EXTENSIONS: Record<AttachmentKind, string> = {
	photo: 'jpg',
	video: 'mp4',
	audio: 'mp3',
	voice: 'ogg',
	video_note: 'mp4',
	animation: 'mp4',
	sticker: 'webp',
	document: 'bin',
};

/**
 * Saves one downloaded attachment into the media folder, without ever
 * overwriting a file that is already there.
 *
 * @param index position within the message, to keep several files apart
 */
export async function saveAttachment(
	vault: Vault,
	folder: string,
	attachment: Attachment,
	message: IncomingMessage,
	index: number,
	data: ArrayBuffer,
): Promise<TFile> {
	await ensureFolder(vault, folder);
	const name = buildFileName(attachment, message, index);
	const path = uniquePath(
		vault,
		folder.length > 0 ? `${folder}/${name}` : name,
	);
	return vault.createBinary(path, data);
}

function buildFileName(
	attachment: Attachment,
	message: IncomingMessage,
	index: number,
): string {
	const given = sanitizeForFileName(attachment.fileName);
	if (given.length > 0) return given;

	// Photos and voice notes arrive unnamed, so name them after the message.
	const suffix = index > 0 ? `-${String(index + 1)}` : '';
	const id = String(message.messageId);
	return `${attachment.kind}-${id}${suffix}.${extensionFor(attachment)}`;
}

function extensionFor(attachment: Attachment): string {
	if (attachment.kind === 'document' && attachment.mimeType.length > 0) {
		const subtype = sanitizeForFileName(
			attachment.mimeType.split('/')[1] ?? '',
		);
		if (subtype.length > 0) return subtype;
	}
	return EXTENSIONS[attachment.kind];
}
