import { MarkdownView, Notice, normalizePath, TFile, type App } from 'obsidian';
import { applyEdit, type TextEdit } from '../core/edit';
import type { EditOutcome, FixHost, FixPreview } from './fix-service';
import { PreviewModal } from '../ui/preview-modal';

export function createFixHost(app: App): FixHost {
	const openEditor = (path: string) => {
		for (const leaf of app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path && view.getMode() === 'source') return view.editor;
		}
		return null;
	};

	return {
		async applyEdit(path: string, edit: TextEdit): Promise<EditOutcome> {
			const file = app.vault.getFileByPath(path);
			if (!file) return { ok: false, reason: 'missing' };
			try {
				// A note open in the editor is changed through the editor, which keeps the cursor and its undo history.
				const editor = openEditor(path);
				if (editor) {
					const result = applyEdit(editor.getValue(), edit);
					if (!result.ok) return { ok: false, reason: 'stale' };
					const from = editor.offsetToPos(result.edit.start);
					const to = editor.offsetToPos(result.edit.start + result.edit.before.length);
					editor.replaceRange(result.edit.after, from, to);
					return { ok: true, edit: result.edit };
				}
				// Otherwise `process` reads, changes and writes in one atomic step.
				let outcome: EditOutcome = { ok: false, reason: 'error' };
				await app.vault.process(file, (data) => {
					const result = applyEdit(data, edit);
					if (!result.ok) {
						outcome = { ok: false, reason: 'stale' };
						return data;
					}
					outcome = { ok: true, edit: result.edit };
					return result.text;
				});
				return outcome;
			} catch {
				return { ok: false, reason: 'error' };
			}
		},

		async readText(path: string): Promise<string | null> {
			const editor = openEditor(path);
			if (editor) return editor.getValue();
			const file = app.vault.getFileByPath(path);
			if (!file) return null;
			try {
				return await app.vault.read(file);
			} catch {
				return null;
			}
		},

		resolveNewNote(sourcePath, folder, name) {
			const parent = folder ?? app.fileManager.getNewFileParent(sourcePath).path;
			const path = normalizePath(parent === '/' || parent === '' ? `${name}.md` : `${parent}/${name}.md`);
			return { path, exists: app.vault.getAbstractFileByPath(path) !== null };
		},

		async createNote(path) {
			try {
				if (app.vault.getAbstractFileByPath(path)) return { ok: false, error: 'A note with that name already exists.' };
				const slash = path.lastIndexOf('/');
				if (slash > 0) {
					const folder = path.slice(0, slash);
					if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
				}
				await app.vault.create(path, '');
				return { ok: true };
			} catch {
				return { ok: false, error: 'The note could not be created. Check the name and folder.' };
			}
		},

		async trashIfEmpty(path) {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return 'missing';
			if ((await app.vault.read(file)).trim() !== '') return 'not-empty';
			await app.fileManager.trashFile(file);
			return 'trashed';
		},

		confirm: (preview: FixPreview) => new PreviewModal(app, preview).openAndWait(),

		notify(message, undo) {
			if (!undo) {
				new Notice(message);
				return;
			}
			const fragment = createFragment((el) => {
				el.createSpan({ text: `${message} ` });
				const button = el.createEl('button', { text: 'Undo', cls: 'link-doctor-notice-undo' });
				button.addEventListener('click', undo);
			});
			new Notice(fragment, 8000);
		},
	};
}
