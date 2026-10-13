import { Modal, type App } from 'obsidian';

/** A small yes/no dialog with large buttons that works by tap. */
export class ConfirmModal extends Modal {
	private decision: (value: boolean) => void = () => {};
	private decided = false;

	constructor(
		app: App,
		private readonly title: string,
		private readonly body: string,
		private readonly confirmLabel: string,
	) {
		super(app);
	}

	openAndWait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.decision = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.createDiv({ text: this.body });
		const buttons = this.contentEl.createDiv({ cls: 'link-doctor-preview-buttons' });
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		const confirm = buttons.createEl('button', { text: this.confirmLabel, cls: 'mod-warning' });
		cancel.addEventListener('click', () => this.finish(false));
		confirm.addEventListener('click', () => this.finish(true));
		cancel.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(false);
	}

	private finish(value: boolean): void {
		if (this.decided) return;
		this.decided = true;
		this.decision(value);
		this.close();
	}
}
