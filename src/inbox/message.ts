import { ChatRef } from '../telegram/types';

/**
 * A message on its way into the vault, normalised away from the Bot API shape.
 *
 * The routing engine works on this type only, so filters and templates stay
 * testable and do not have to follow changes in Telegram's payloads.
 */
export type AttachmentKind =
	| 'photo'
	| 'video'
	| 'audio'
	| 'voice'
	| 'video_note'
	| 'animation'
	| 'sticker'
	| 'document';

/** A file attached to a message, before it has been downloaded. */
export interface Attachment {
	fileId: string;
	/**
	 * Telegram's stable id for the file itself. The same file can arrive under
	 * two fields at once, and this is what tells those apart from real siblings.
	 */
	uniqueId: string;
	kind: AttachmentKind;
	/** Name Telegram sent. Empty for photos and voice notes, which have none. */
	fileName: string;
	mimeType: string;
}

export interface IncomingMessage {
	text: string;
	attachments: Attachment[];
	/** Hashtags without the leading `#`, in the order they appear in the text. */
	hashtags: string[];
	chat: ChatRef;
	/** Forum topic id, or null outside forum topics. */
	topicId: number | null;
	/** Forum topic name, empty when Telegram did not send one. */
	topicName: string;
	messageId: number;
	userId: number;
	/** Sender username without the `@`, empty when the sender has none. */
	username: string;
	date: Date;
}

const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;

/** Pulls hashtags out of message text, keeping the order they appear in. */
export function extractHashtags(text: string): string[] {
	const tags: string[] = [];
	for (const match of text.matchAll(HASHTAG_PATTERN)) {
		const tag = match[1];
		if (tag !== undefined) tags.push(tag);
	}
	return tags;
}
