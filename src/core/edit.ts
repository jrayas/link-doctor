import { lineAt } from './text';

export interface TextEdit {
	/** Offset where `before` starts in the text. */
	start: number;
	before: string;
	after: string;
}

export type EditResult =
	| { ok: true; text: string; edit: TextEdit; previewBefore: string; previewAfter: string; line: number }
	| { ok: false; reason: 'stale' };

/**
 * Replaces `before` with `after`, but only if `before` is still where we expect it, or
 * occurs exactly once in the text. Only the span changes, so line endings are never touched.
 * Undo is the same operation with `before` and `after` swapped.
 */
export function applyEdit(text: string, edit: TextEdit): EditResult {
	let start = edit.start;
	if (text.slice(start, start + edit.before.length) !== edit.before) {
		const first = text.indexOf(edit.before);
		if (first === -1 || text.indexOf(edit.before, first + 1) !== -1) return { ok: false, reason: 'stale' };
		start = first;
	}
	const next = text.slice(0, start) + edit.after + text.slice(start + edit.before.length);
	const lineBefore = lineAt(text, start);
	const lineAfter = lineAt(next, start);
	return {
		ok: true,
		text: next,
		edit: { start, before: edit.before, after: edit.after },
		previewBefore: lineBefore.text,
		previewAfter: lineAfter.text,
		line: lineBefore.line,
	};
}

/** The edit that undoes `edit`. */
export function invertEdit(edit: TextEdit): TextEdit {
	return { start: edit.start, before: edit.after, after: edit.before };
}

/** Preview of an edit without applying it. */
export function previewEdit(text: string, edit: TextEdit): { before: string; after: string; line: number } | null {
	const result = applyEdit(text, edit);
	return result.ok ? { before: result.previewBefore, after: result.previewAfter, line: result.line } : null;
}
