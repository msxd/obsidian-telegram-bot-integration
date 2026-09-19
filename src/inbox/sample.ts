import { extractHashtags, IncomingMessage } from './message';

const SAMPLE_TEXT = 'Buy oat milk on the way home #errand #today';

/**
 * A stand-in message for previewing rules in settings, which need something to
 * render against before any real message has arrived.
 */
export function createSampleMessage(): IncomingMessage {
	return {
		text: SAMPLE_TEXT,
		attachments: [],
		hashtags: extractHashtags(SAMPLE_TEXT),
		chat: {
			id: 123456789,
			type: 'private',
			label: 'Notes to self',
			username: 'alex',
		},
		topicId: null,
		topicName: '',
		messageId: 4821,
		userId: 123456789,
		username: 'alex',
		date: new Date(),
	};
}
