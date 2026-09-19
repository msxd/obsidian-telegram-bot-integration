/**
 * Emoji Telegram accepts in `setMessageReaction`.
 *
 * The set is fixed by Telegram and anything outside it is rejected, so the
 * settings offer these rather than free text. Written exactly as the Bot API
 * lists them, without variation selectors, since the match is literal.
 */
export const ALLOWED_REACTIONS: readonly string[] = [
	'\u{1F44D}', // thumbs up
	'\u{1F44E}', // thumbs down
	'❤', // heart
	'\u{1F525}', // fire
	'\u{1F970}', // smiling face with hearts
	'\u{1F44F}', // clapping hands
	'\u{1F601}', // beaming face
	'\u{1F914}', // thinking face
	'\u{1F92F}', // exploding head
	'\u{1F631}', // screaming face
	'\u{1F92C}', // face with symbols on mouth
	'\u{1F622}', // crying face
	'\u{1F389}', // party popper
	'\u{1F929}', // star-struck
	'\u{1F92E}', // face vomiting
	'\u{1F4A9}', // pile of poo
	'\u{1F64F}', // folded hands
	'\u{1F44C}', // OK hand
	'\u{1F54A}', // dove
	'\u{1F921}', // clown face
	'\u{1F971}', // yawning face
	'\u{1F974}', // woozy face
	'\u{1F60D}', // heart eyes
	'\u{1F433}', // whale
	'❤‍\u{1F525}', // heart on fire
	'\u{1F31A}', // new moon face
	'\u{1F32D}', // hot dog
	'\u{1F4AF}', // hundred points
	'\u{1F923}', // rolling on the floor laughing
	'⚡', // high voltage
	'\u{1F34C}', // banana
	'\u{1F3C6}', // trophy
	'\u{1F494}', // broken heart
	'\u{1F928}', // face with raised eyebrow
	'\u{1F610}', // neutral face
	'\u{1F353}', // strawberry
	'\u{1F37E}', // bottle with popping cork
	'\u{1F48B}', // kiss mark
	'\u{1F595}', // middle finger
	'\u{1F608}', // smiling face with horns
	'\u{1F634}', // sleeping face
	'\u{1F62D}', // loudly crying face
	'\u{1F913}', // nerd face
	'\u{1F47B}', // ghost
	'\u{1F468}‍\u{1F4BB}', // man technologist
	'\u{1F440}', // eyes
	'\u{1F383}', // jack-o-lantern
	'\u{1F648}', // see-no-evil monkey
	'\u{1F607}', // smiling face with halo
	'\u{1F628}', // fearful face
	'\u{1F91D}', // handshake
	'✍', // writing hand
	'\u{1F917}', // hugging face
	'\u{1FAE1}', // saluting face
	'\u{1F385}', // Santa Claus
	'\u{1F384}', // Christmas tree
	'☃', // snowman
	'\u{1F485}', // nail polish
	'\u{1F92A}', // zany face
	'\u{1F5FF}', // moai
	'\u{1F192}', // COOL button
	'\u{1F498}', // heart with arrow
	'\u{1F649}', // hear-no-evil monkey
	'\u{1F984}', // unicorn
	'\u{1F618}', // face blowing a kiss
	'\u{1F48A}', // pill
	'\u{1F64A}', // speak-no-evil monkey
	'\u{1F60E}', // smiling face with sunglasses
	'\u{1F47E}', // alien monster
	'\u{1F937}‍♂', // man shrugging
	'\u{1F937}', // person shrugging
	'\u{1F937}‍♀', // woman shrugging
	'\u{1F621}', // enraged face
];

export function isAllowedReaction(emoji: string): boolean {
	return ALLOWED_REACTIONS.includes(emoji);
}
