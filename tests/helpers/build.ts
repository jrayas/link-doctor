import { VaultIndex } from '../../src/core/resolve';
import type { CachedLink, HeadingInfo, NoteSnapshot } from '../../src/core/types';

/** Builds a link whose position is derived from its index, for tests that do not care about offsets. */
export function link(original: string, link_: string, i = 0, displayText?: string): CachedLink {
	return {
		original,
		link: link_,
		...(displayText !== undefined ? { displayText } : {}),
		start: { line: i, col: 0, offset: i * 100 },
		end: { line: i, col: original.length, offset: i * 100 + original.length },
	};
}

export function note(
	path: string,
	opts: { links?: CachedLink[]; headings?: HeadingInfo[]; blocks?: string[]; aliases?: string[] } = {},
): NoteSnapshot {
	return { path, aliases: opts.aliases ?? [], links: opts.links ?? [], headings: opts.headings ?? [], blocks: opts.blocks ?? [] };
}

export function vault(notes: NoteSnapshot[], files: string[] = []): VaultIndex {
	const index = new VaultIndex();
	for (const n of notes) index.setNote(n);
	for (const f of files) index.addFile(f);
	return index;
}
