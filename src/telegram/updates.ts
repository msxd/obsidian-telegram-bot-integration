import {
	Attachment,
	AttachmentKind,
	extractHashtags,
	IncomingMessage,
} from '../inbox/message';
import { toChatRef } from './types';

export interface ParsedUpdate {
	updateId: number;
	/** The message to file, or null when this update carries nothing filable. */
	message: IncomingMessage | null;
	/** True when a message was there but had no text to save. */
	skippedWithoutText: boolean;
}

/**
 * Update fields that wrap something written to a chat.
 *
 * Edits are deliberately left out: `edited_message` would arrive as another
 * message and be filed a second time, leaving a duplicate in the note. Ignoring
 * the edit loses the correction, which is the lesser of the two.
 */
const MESSAGE_FIELDS = ['message', 'channel_post'] as const;

/**
 * Message fields that carry a file, in the order they are looked for.
 *
 * Order matters because Telegram fills more than one of them for the same file:
 * an animation is also reported as a document for backward compatibility. The
 * more specific field comes first so it wins, and the duplicate is dropped by
 * `file_unique_id`.
 */
const ATTACHMENT_FIELDS: readonly AttachmentKind[] = [
	'photo',
	'video',
	'audio',
	'voice',
	'video_note',
	'animation',
	'sticker',
	'document',
];

/**
 * Turns a raw update into the plugin's own shape. Returns null when the value
 * is not an update at all; an update the plugin cannot file still comes back,
 * because its id has to advance the offset either way.
 */
export function parseUpdate(value: unknown): ParsedUpdate | null {
	if (typeof value !== 'object' || value === null) return null;
	const update = value as Record<string, unknown>;
	if (typeof update.update_id !== 'number') return null;

	const payload = findMessagePayload(update);
	if (payload === null) {
		return {
			updateId: update.update_id,
			message: null,
			skippedWithoutText: false,
		};
	}

	const message = toIncomingMessage(payload);
	return {
		updateId: update.update_id,
		message,
		skippedWithoutText: message === null,
	};
}

function findMessagePayload(
	update: Record<string, unknown>,
): Record<string, unknown> | null {
	for (const field of MESSAGE_FIELDS) {
		const payload = update[field];
		if (typeof payload === 'object' && payload !== null) {
			return payload as Record<string, unknown>;
		}
	}
	return null;
}

/** Returns null for anything with neither text nor a file to save. */
function toIncomingMessage(
	payload: Record<string, unknown>,
): IncomingMessage | null {
	const chat = toChatRef(payload.chat);
	if (chat === null) return null;

	const text = readText(payload);
	const attachments = readAttachments(payload);
	if (text.trim().length === 0 && attachments.length === 0) return null;

	const from =
		typeof payload.from === 'object' && payload.from !== null
			? (payload.from as Record<string, unknown>)
			: {};

	return {
		text,
		attachments,
		hashtags: extractHashtags(text),
		chat,
		topicId:
			payload.is_topic_message === true &&
			typeof payload.message_thread_id === 'number'
				? payload.message_thread_id
				: null,
		topicName: readTopicName(payload),
		messageId:
			typeof payload.message_id === 'number' ? payload.message_id : 0,
		userId: typeof from.id === 'number' ? from.id : chat.id,
		username: typeof from.username === 'string' ? from.username : '',
		date: readDate(payload),
	};
}

function readAttachments(payload: Record<string, unknown>): Attachment[] {
	const attachments: Attachment[] = [];
	const seen = new Set<string>();

	for (const kind of ATTACHMENT_FIELDS) {
		const value = payload[kind];
		if (value === undefined || value === null) continue;

		// A photo arrives as an array of sizes, largest last.
		const file = Array.isArray(value)
			? (value as unknown[])[value.length - 1]
			: value;
		const attachment = toAttachment(file, kind);
		if (attachment === null) continue;

		const key =
			attachment.uniqueId.length > 0
				? attachment.uniqueId
				: attachment.fileId;
		if (seen.has(key)) continue;
		seen.add(key);
		attachments.push(attachment);
	}
	return attachments;
}

function toAttachment(value: unknown, kind: AttachmentKind): Attachment | null {
	if (typeof value !== 'object' || value === null) return null;
	const file = value as Record<string, unknown>;
	if (typeof file.file_id !== 'string') return null;
	return {
		fileId: file.file_id,
		uniqueId:
			typeof file.file_unique_id === 'string' ? file.file_unique_id : '',
		kind,
		fileName: typeof file.file_name === 'string' ? file.file_name : '',
		mimeType: typeof file.mime_type === 'string' ? file.mime_type : '',
	};
}

/** A caption carries the text of a photo or a file. */
function readText(payload: Record<string, unknown>): string {
	if (typeof payload.text === 'string') return payload.text;
	if (typeof payload.caption === 'string') return payload.caption;
	return '';
}

/**
 * Telegram only names a forum topic on the message that created it, which
 * arrives quoted as `reply_to_message`. Elsewhere the name is simply absent.
 */
function readTopicName(payload: Record<string, unknown>): string {
	const replyTo = payload.reply_to_message;
	if (typeof replyTo !== 'object' || replyTo === null) return '';
	const created = (replyTo as Record<string, unknown>).forum_topic_created;
	if (typeof created !== 'object' || created === null) return '';
	const name = (created as Record<string, unknown>).name;
	return typeof name === 'string' ? name : '';
}

function readDate(payload: Record<string, unknown>): Date {
	// Telegram sends seconds since the epoch.
	return typeof payload.date === 'number'
		? new Date(payload.date * 1000)
		: new Date();
}
