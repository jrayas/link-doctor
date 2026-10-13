import { invertEdit, previewEdit, type TextEdit } from '../core/edit';
import { planFix, type FixAction, type FixPlan } from '../core/fix';
import type { VaultIndex } from '../core/resolve';
import { suggestFor, type Suggestion } from '../core/suggest';
import { UndoStack } from '../core/undo-stack';
import type { BrokenLink } from '../core/types';

export type EditOutcome = { ok: true; edit: TextEdit } | { ok: false; reason: 'stale' | 'missing' | 'error' };

export interface FixPreview {
	plan: FixPlan;
	/** Folder and file name that would be created, resolved by the host. Only for `create`. */
	createPath?: string;
	/** Full lines before and after the change. Only for edits. */
	lineBefore?: string;
	lineAfter?: string;
	line: number;
	warnings: string[];
}

/** Everything that touches the vault. The Obsidian implementation is in `obsidian-fix-host.ts`. */
export interface FixHost {
	/** Applies `edit` to the note atomically. Must fail with `stale` rather than guess. */
	applyEdit(path: string, edit: TextEdit): Promise<EditOutcome>;
	/** The note's text, or null if it cannot be read. */
	readText(path: string): Promise<string | null>;
	/** Picks the path for a new note and reports whether something already exists there. */
	resolveNewNote(sourcePath: string, folder: string | null, name: string): { path: string; exists: boolean };
	createNote(path: string): Promise<{ ok: true } | { ok: false; error: string }>;
	/** Moves a note to the trash only if it is still empty. */
	trashIfEmpty(path: string): Promise<'trashed' | 'not-empty' | 'missing'>;
	confirm(preview: FixPreview): Promise<boolean>;
	notify(message: string, undo?: () => void): void;
}

export type UndoEntry =
	| { kind: 'edit'; path: string; edit: TextEdit; label: string }
	| { kind: 'create'; path: string; label: string };

export type FixResult = 'applied' | 'cancelled' | 'failed';

export interface FixSettings {
	confirmBeforeFix: boolean;
	fuzzyThreshold: number;
}


/** Plans, previews, applies and undoes fixes. Holds the session undo stack. */
export class FixService {
	private readonly undoStack = new UndoStack<UndoEntry>(50);
	private readonly listeners = new Set<() => void>();
	private busy = false;

	constructor(
		private readonly host: FixHost,
		private readonly getIndex: () => VaultIndex,
		private readonly getSettings: () => FixSettings,
	) {}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	canUndo(): boolean {
		return this.undoStack.size > 0;
	}

	undoLabel(): string | null {
		return this.undoStack.peek()?.label ?? null;
	}

	suggestions(link: BrokenLink, limit = 3): Suggestion[] {
		return suggestFor(link, this.getIndex(), { threshold: this.getSettings().fuzzyThreshold, limit });
	}

	/** Preview, then apply. Resolves when the user has decided and the change is written. */
	async run(link: BrokenLink, action: FixAction): Promise<FixResult> {
		if (this.busy) return 'cancelled';
		this.busy = true;
		try {
			const planned = planFix(link, action, this.getIndex());
			if (!planned.ok) {
				this.host.notify(planned.error);
				return 'failed';
			}
			const plan = planned.plan;
			const preview = await this.buildPreview(plan);
			if (!preview) return 'failed';
			if (this.getSettings().confirmBeforeFix && !(await this.host.confirm(preview))) return 'cancelled';
			return plan.kind === 'create' ? await this.applyCreate(plan, preview) : await this.applyEdit(plan);
		} finally {
			this.busy = false;
		}
	}

	async undo(): Promise<boolean> {
		const entry = this.undoStack.pop();
		if (!entry) return false;
		this.changed();
		if (entry.kind === 'create') {
			const result = await this.host.trashIfEmpty(entry.path);
			if (result === 'trashed') this.host.notify(`Undone: ${entry.label}`);
			else if (result === 'not-empty') this.host.notify('The new note now has content, so it was not removed.');
			else this.host.notify('The new note no longer exists.');
			return result === 'trashed';
		}
		const outcome = await this.host.applyEdit(entry.path, invertEdit(entry.edit));
		if (outcome.ok) {
			this.host.notify(`Undone: ${entry.label}`);
			return true;
		}
		this.host.notify(
			outcome.reason === 'stale'
				? 'Cannot undo: that part of the note has changed since the fix.'
				: 'Cannot undo: the note could not be changed.',
		);
		return false;
	}

	private async buildPreview(plan: FixPlan): Promise<FixPreview | null> {
		const link = plan.link;
		if (plan.kind === 'create' && plan.create) {
			const target = this.host.resolveNewNote(link.sourcePath, plan.create.folder, plan.create.name);
			if (target.exists) {
				this.host.notify('A note with that name already exists, so nothing was created.');
				return null;
			}
			return { plan, createPath: target.path, line: link.start.line + 1, warnings: plan.create.warnings };
		}
		if (!plan.edit) return null;
		const text = await this.host.readText(link.sourcePath);
		if (text === null) {
			this.host.notify('That note could not be read.');
			return null;
		}
		const preview = previewEdit(text, plan.edit);
		if (!preview) {
			this.host.notify('The note has changed since the scan. Rescan and try again.');
			return null;
		}
		return { plan, lineBefore: preview.before, lineAfter: preview.after, line: preview.line + 1, warnings: [] };
	}

	private async applyEdit(plan: FixPlan): Promise<FixResult> {
		if (!plan.edit) return 'failed';
		const outcome = await this.host.applyEdit(plan.link.sourcePath, plan.edit);
		if (!outcome.ok) {
			this.host.notify(
				outcome.reason === 'stale'
					? 'The note has changed since the scan, so nothing was changed. Rescan and try again.'
					: 'The note could not be changed.',
			);
			return 'failed';
		}
		const label = plan.kind === 'remove' ? 'removed a link' : `fixed ${plan.beforeText}`;
		this.undoStack.push({ kind: 'edit', path: plan.link.sourcePath, edit: outcome.edit, label });
		this.changed();
		this.host.notify(`Done: ${label}.`, () => void this.undo());
		return 'applied';
	}

	private async applyCreate(plan: FixPlan, preview: FixPreview): Promise<FixResult> {
		if (!preview.createPath) return 'failed';
		const result = await this.host.createNote(preview.createPath);
		if (!result.ok) {
			this.host.notify(result.error);
			return 'failed';
		}
		const label = `created ${preview.createPath}`;
		this.undoStack.push({ kind: 'create', path: preview.createPath, label });
		this.changed();
		this.host.notify(`Done: ${label}.`, () => void this.undo());
		return 'applied';
	}

	private changed(): void {
		for (const l of [...this.listeners]) l();
	}
}
