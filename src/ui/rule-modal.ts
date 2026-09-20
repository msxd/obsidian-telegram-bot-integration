import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import { describeFilter, matchesFilter, parseFilter } from '../inbox/filter';
import { IncomingMessage } from '../inbox/message';
import { previewRuleMediaFolder, previewRulePath } from '../inbox/routing';
import { createSampleMessage } from '../inbox/sample';
import {
	DEFAULT_NOTE_NAME,
	InboxSettings,
	isFallbackRule,
	MessageRule,
} from '../settings';

const FILTERS: readonly (readonly [string, string])[] = [
	['{{all}}', 'every message'],
	['{{content~text}}', 'message contains text'],
	['{{hashtag~tag}}', 'message carries #tag'],
];

const VARIABLES: readonly (readonly [string, string])[] = [
	['{{content:30}}', 'first 30 characters of the message'],
	['{{chat}}, {{chatId}}', 'chat name and id'],
	['{{topic}}, {{topicId}}', 'forum topic name and id'],
	['{{messageId}}', 'message id'],
	['{{user}}, {{userId}}', 'sender username (or id when missing) and id'],
	['{{messageDate:YYYYMMDD}}', 'date in the given format'],
	['{{messageTime:HHmmss}}', 'time in the given format'],
	['{{hashtag:[0]}}', 'first hashtag, without the #'],
];

/** Editor for one routing rule, with a live preview against a sample message. */
export class RuleModal extends Modal {
	private readonly settings: InboxSettings;
	private readonly draft: MessageRule;
	private readonly title: string;
	private readonly onSubmit: (rule: MessageRule) => void;
	private readonly sample: IncomingMessage = createSampleMessage();
	private filterErrorEl: HTMLElement | null = null;
	private matchEl: HTMLElement | null = null;
	private pathEl: HTMLElement | null = null;
	private mediaEl: HTMLElement | null = null;
	private saveButton: ButtonComponent | null = null;

	constructor(
		app: App,
		settings: InboxSettings,
		rule: MessageRule,
		title: string,
		onSubmit: (rule: MessageRule) => void,
	) {
		super(app);
		this.settings = settings;
		// Edited on a copy, so closing without saving leaves the stored rule alone.
		this.draft = { ...rule };
		this.title = title;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		this.setTitle(this.title);
		const { contentEl } = this;
		contentEl.addClass('msxd-rule-modal');

		// The default rule claims whatever is left over, so it has no filter.
		if (!isFallbackRule(this.draft)) {
			new Setting(contentEl)
				.setName('Filter')
				.setDesc('Which messages this rule claims.')
				.addText((text) => {
					text.setPlaceholder('{{all}}')
						.setValue(this.draft.filter)
						.onChange((value) => {
							this.draft.filter = value;
							this.refresh();
						});
				});
			this.filterErrorEl = contentEl.createDiv({
				cls: 'msxd-status is-error',
			});
		} else {
			contentEl.createDiv({
				cls: 'msxd-status',
				text: 'Claims every message no other rule took. It is always last and cannot be removed.',
			});
		}

		new Setting(contentEl)
			.setName('Path')
			.setDesc(
				'Takes the variables listed under Syntax below. Ending in .md names the note itself, so messages collect in one file; anything else is a folder.',
			)
			.addTextArea((text) => {
				text.inputEl.addClass('msxd-template-input');
				text.setPlaceholder('Journal/{{messageDate:YYYY-MM}}.md')
					.setValue(this.draft.path)
					.onChange((value) => {
						this.draft.path = value;
						this.refresh();
					});
			});

		new Setting(contentEl)
			.setName('Media path')
			.setDesc(
				'Folder for photos, files and voice notes. Takes the same variables. Leave empty to use the shared media folder.',
			)
			.addTextArea((text) => {
				text.inputEl.addClass('msxd-template-input');
				text.setPlaceholder('{{chat}}/media')
					.setValue(this.draft.mediaPath)
					.onChange((value) => {
						this.draft.mediaPath = value;
						this.refresh();
					});
			});

		new Setting(contentEl)
			.setName('Note name')
			.setDesc(
				'Used when the path above points at a folder. Leave empty to use the default rule\u2019s.',
			)
			.addTextArea((text) => {
				text.inputEl.addClass('msxd-template-input');
				text.setPlaceholder(DEFAULT_NOTE_NAME)
					.setValue(this.draft.noteName)
					.onChange((value) => {
						this.draft.noteName = value;
						this.refresh();
					});
			});

		new Setting(contentEl)
			.setName('Heading')
			.setDesc('Written before the message. Leave empty for none.')
			.addText((text) => {
				text.setPlaceholder('## {{messageTime:HH:mm}}')
					.setValue(this.draft.heading)
					.onChange((value) => {
						this.draft.heading = value;
					});
			});

		new Setting(contentEl)
			.setName('Separate messages')
			.setDesc(
				'Put a horizontal rule before a message added to a note that already has content.',
			)
			.addToggle((toggle) => {
				toggle.setValue(this.draft.separate).onChange((value) => {
					this.draft.separate = value;
				});
			});

		this.buildPreview(contentEl);
		this.buildSyntaxHelp(contentEl);

		new Setting(contentEl)
			.addButton((button) => {
				this.saveButton = button;
				button
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						this.submit();
					});
			})
			.addButton((button) => {
				button.setButtonText('Cancel').onClick(() => {
					this.close();
				});
			});

		this.refresh();
	}

	onClose(): void {
		this.contentEl.empty();
		this.filterErrorEl = null;
		this.matchEl = null;
		this.pathEl = null;
		this.mediaEl = null;
		this.saveButton = null;
	}

	private buildPreview(containerEl: HTMLElement): void {
		const preview = containerEl.createDiv({ cls: 'msxd-preview' });
		preview.createDiv({
			cls: 'msxd-preview-title',
			text: 'Preview',
		});
		preview.createDiv({
			cls: 'msxd-status',
			text: `Sample message: ${this.sample.text}`,
		});
		this.matchEl = preview.createDiv({ cls: 'msxd-status' });
		this.pathEl = preview.createDiv({ cls: 'msxd-preview-path' });
		this.mediaEl = preview.createDiv({ cls: 'msxd-preview-path' });
	}

	private buildSyntaxHelp(containerEl: HTMLElement): void {
		const details = containerEl.createEl('details', { cls: 'msxd-help' });
		details.createEl('summary', { text: 'Syntax' });
		appendTokenList(details, 'Filters', FILTERS);
		appendTokenList(details, 'Path and heading variables', VARIABLES);
	}

	private refresh(): void {
		const parsed = parseFilter(this.draft.filter);

		this.filterErrorEl?.setText(parsed.ok ? '' : parsed.error);
		this.saveButton?.setDisabled(!parsed.ok);

		const matchEl = this.matchEl;
		// The default rule takes whatever is left, so matching says nothing.
		if (matchEl !== null && !isFallbackRule(this.draft)) {
			const matches = parsed.ok && matchesFilter(parsed.filter, this.sample);
			matchEl.setText(
				parsed.ok
					? `${describeFilter(parsed.filter)} — ${matches ? 'matches the sample' : 'does not match the sample'}`
					: '',
			);
			matchEl.toggleClass('is-ok', matches);
		}

		this.pathEl?.setText(
			previewRulePath(this.settings, this.draft, this.sample),
		);
		this.mediaEl?.setText(
			`Media: ${previewRuleMediaFolder(this.settings, this.draft, this.sample)}/`,
		);
	}

	private submit(): void {
		// The save button is disabled for a broken filter, but guard anyway.
		if (!parseFilter(this.draft.filter).ok) return;
		this.onSubmit({ ...this.draft });
		this.close();
	}
}

function appendTokenList(
	containerEl: HTMLElement,
	title: string,
	tokens: readonly (readonly [string, string])[],
): void {
	containerEl.createDiv({ cls: 'msxd-help-title', text: title });
	const list = containerEl.createEl('ul');
	for (const [token, meaning] of tokens) {
		const item = list.createEl('li');
		item.createEl('code', { text: token });
		item.appendText(` — ${meaning}`);
	}
}
