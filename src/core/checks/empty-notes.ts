import type { VaultIndex } from '../resolve';

/** Paths of notes with no content apart from frontmatter, sorted by path. Pure: no Obsidian API. */
export function findEmptyNotes(index: VaultIndex, isIgnored?: (path: string) => boolean): string[] {
	return index
		.allNotes()
		.filter((note) => note.empty === true && !isIgnored?.(note.path))
		.map((note) => note.path)
		.sort((a, b) => a.localeCompare(b));
}
