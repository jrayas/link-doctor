import type { TextEdit } from './edit';
import type { VaultIndex } from './resolve';
import { linkPathFor, removeLinkKeepText, retarget } from './rewrite';
import type { Suggestion } from './suggest';
import { basename, dirname, extensionOf, pathLengthWarning, sanitiseFileName, stripExtension } from './text';
import type { BrokenLink } from './types';

export type FixAction = { kind: 'apply'; suggestion: Suggestion } | { kind: 'remove' } | { kind: 'create' };

export interface NewNoteRequest {
	/** Folder the link names, or null to use the user's default location for new notes. */
	folder: string | null;
	/** File name without extension, already made safe for every platform. */
	name: string;
	warnings: string[];
}

export interface FixPlan {
	kind: FixAction['kind'];
	link: BrokenLink;
	/** The text change; absent when the fix creates a note instead. */
	edit?: TextEdit;
	create?: NewNoteRequest;
	/** Short description for buttons, notices and the undo list. */
	label: string;
	/** The link before and after, for the preview. */
	beforeText: string;
	afterText: string;
}

export type PlanResult = { ok: true; plan: FixPlan } | { ok: false; error: string };

/** A missing note can be created for wikilinks and for Markdown links that point at a `.md` file. */
export function canCreateNote(link: BrokenLink): boolean {
	if (link.type === 'missing-note') return link.target.trim() !== '';
	if (link.type === 'missing-markdown-target') {
		const ext = extensionOf(basename(link.target));
		return link.target.trim() !== '' && (ext === 'md' || ext === '');
	}
	return false;
}

export function newNoteRequest(link: BrokenLink): NewNoteRequest {
	const base = stripExtension(basename(link.target)) || link.target;
	const sanitised = sanitiseFileName(base);
	const dir = dirname(link.target);
	const folder = dir === '' ? null : dir.split('/').map((seg) => sanitiseFileName(seg).name).join('/');
	const warnings = [...sanitised.warnings];
	const long = pathLengthWarning(`${folder ?? ''}/${sanitised.name}.md`);
	if (long) warnings.push(long);
	return { folder, name: sanitised.name, warnings };
}

/** Builds the exact change for a fix. Pure: nothing is written. */
export function planFix(link: BrokenLink, action: FixAction, index: VaultIndex): PlanResult {
	switch (action.kind) {
		case 'apply': {
			const s = action.suggestion;
			const isSubpathFix = s.kind === 'heading' || s.kind === 'block';
			const after = isSubpathFix
				? retarget(link.original, { subpath: s.newSubpath ?? '' })
				: retarget(link.original, {
						path: linkPathFor(s.targetPath, link.sourcePath, index, link.syntax, link.target.includes('/')),
					});
			if (after === null) return { ok: false, error: 'This link could not be understood, so it was left alone.' };
			if (after === link.original) return { ok: false, error: 'That suggestion is the same as the current link.' };
			return {
				ok: true,
				plan: {
					kind: 'apply',
					link,
					edit: { start: link.start.offset, before: link.original, after },
					label: `Use ${s.label}`,
					beforeText: link.original,
					afterText: after,
				},
			};
		}
		case 'remove': {
			const after = removeLinkKeepText(link.original);
			if (after === null) return { ok: false, error: 'This link could not be understood, so it was left alone.' };
			return {
				ok: true,
				plan: {
					kind: 'remove',
					link,
					edit: { start: link.start.offset, before: link.original, after },
					label: 'Remove link, keep text',
					beforeText: link.original,
					afterText: after === '' ? '(nothing)' : after,
				},
			};
		}
		case 'create': {
			if (!canCreateNote(link)) return { ok: false, error: 'A note cannot be created for this kind of link.' };
			const create = newNoteRequest(link);
			return {
				ok: true,
				plan: {
					kind: 'create',
					link,
					create,
					label: `Create note ${create.name}`,
					beforeText: link.original,
					afterText: link.original,
				},
			};
		}
	}
}
