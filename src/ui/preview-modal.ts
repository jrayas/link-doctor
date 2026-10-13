import { Modal, type App } from 'obsidian';
import type { FixPreview } from '../adapters/fix-service';

/** Shows exactly what will change and waits for Apply or Cancel. Scrolls on small screens. */
export class PreviewModal extends Modal {
	private decision: (value: boolean) => void = () => {};
	private decided = false;

	constructor(app: App, private readonly preview: FixPreview) {
		super(app);
	}

	openAndWait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.decision = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		const { plan } = this.preview;
		this.modalEl.addClass('link-doctor-modal');
		titleEl.setText(plan.kind === 'create' ? 'Create note' : 'Preview fix');
		const body = contentEl.createDiv({ cls: 'link-doctor-preview' });
		body.createDiv({ cls: 'link-doctor-preview-where', text: `${plan.link.sourcePath}, line ${this.preview.line}` });

		if (plan.kind === 'create' && this.preview.createPath) {
			body.createDiv({ text: 'A new empty note will be created at:' });
			body.createEl('code', { text: this.preview.createPath, cls: 'link-doctor-preview-path' });
		} else {
			this.block(body, 'Before', this.preview.lineBefore ?? plan.beforeText, 'is-before');
			this.block(body, 'After', this.preview.lineAfter ?? plan.afterText, 'is-after');
		}
		if (this.preview.warnings.length > 0) {
			const warnings = body.createEl('ul', { cls: 'link-doctor-preview-warnings', attr: { role: 'list' } });
			for (const w of this.preview.warnings) warnings.createEl('li', { text: w });
		}
		body.createDiv({ cls: 'link-doctor-preview-hint', text: 'You can undo this afterwards.' });

		const buttons = contentEl.createDiv({ cls: 'link-doctor-preview-buttons' });
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		const apply = buttons.createEl('button', { text: plan.kind === 'create' ? 'Create note' : 'Apply fix', cls: 'mod-cta' });
		cancel.addEventListener('click', () => this.finish(false));
		apply.addEventListener('click', () => this.finish(true));
		apply.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(false);
	}

	private block(parent: HTMLElement, label: string, text: string, cls: string): void {
		const box = parent.createDiv({ cls: `link-doctor-preview-block ${cls}` });
		box.createDiv({ cls: 'link-doctor-preview-label', text: label });
		box.createEl('pre', { cls: 'link-doctor-preview-text', text });
	}

	private finish(value: boolean): void {
		if (this.decided) return;
		this.decided = true;
		this.decision(value);
		this.close();
	}
}
