import { confidenceOf, rankMatches, type Confidence, type FuzzyCandidate } from './fuzzy';
import type { VaultIndex } from './resolve';
import { basename, extensionOf, stripExtension } from './text';
import type { BrokenLink } from './types';

export interface Suggestion {
	kind: 'note' | 'file' | 'heading' | 'block';
	/** The existing vault file the new link will point to. */
	targetPath: string;
	/** Text shown to the user. */
	label: string;
	/** New path part for the link, or undefined when only the subpath changes. */
	newTarget?: string;
	/** New subpath including its leading `#` or `#^`, or undefined when only the path changes. */
	newSubpath?: string;
	score: number;
	confidence: Confidence;
	/** Set when the match came from a note alias. */
	viaAlias?: string;
}

export interface SuggestOptions {
	/** Minimum similarity, 0 to 1. */
	threshold: number;
	limit: number;
}

interface PathCandidate {
	path: string;
	alias?: string;
}

/** Ranked fixes for a broken link. Pure: works on the index only. */
export function suggestFor(broken: BrokenLink, index: VaultIndex, options: SuggestOptions): Suggestion[] {
	switch (broken.type) {
		case 'missing-heading':
			return suggestHeadings(broken, index, options);
		case 'missing-block':
			return suggestBlocks(broken, index, options);
		default:
			return suggestFiles(broken, index, options);
	}
}

function suggestFiles(broken: BrokenLink, index: VaultIndex, options: SuggestOptions): Suggestion[] {
	const wantsNote = broken.type === 'missing-note';
	const wantedExt = extensionOf(basename(broken.target));
	const query = wantedExt === 'md' || wantedExt === '' ? stripExtension(basename(broken.target)) : basename(broken.target);
	const candidates: FuzzyCandidate<PathCandidate>[] = [];
	if (wantsNote) {
		for (const note of index.allNotes()) {
			if (note.path === broken.sourcePath) continue;
			candidates.push({ text: stripExtension(basename(note.path)), value: { path: note.path } });
			for (const alias of note.aliases) candidates.push({ text: alias, value: { path: note.path, alias } });
		}
	} else {
		for (const path of index.allFiles()) {
			const isNote = extensionOf(path) === 'md';
			if (broken.type === 'missing-embed' && !isNote && wantedExt !== '' && extensionOf(path) !== wantedExt) continue;
			candidates.push({ text: isNote ? stripExtension(basename(path)) : basename(path), value: { path } });
		}
	}
	const ranked = rankMatches(query, candidates, options.threshold, options.limit * 3);
	const seen = new Set<string>();
	const out: Suggestion[] = [];
	for (const r of ranked) {
		if (seen.has(r.value.path)) continue;
		seen.add(r.value.path);
		const isNote = extensionOf(r.value.path) === 'md';
		out.push({
			kind: isNote ? 'note' : 'file',
			targetPath: r.value.path,
			label: r.value.alias ? `${r.text} (alias of ${stripExtension(basename(r.value.path))})` : r.text,
			score: r.score,
			confidence: confidenceOf(r.score),
			...(r.value.alias !== undefined ? { viaAlias: r.value.alias } : {}),
		});
		if (out.length >= options.limit) break;
	}
	return out;
}

function suggestHeadings(broken: BrokenLink, index: VaultIndex, options: SuggestOptions): Suggestion[] {
	const note = broken.resolvedPath ? index.getNote(broken.resolvedPath) : undefined;
	if (!note) return [];
	const parts = broken.subpath.slice(1).split('#');
	const query = parts[parts.length - 1] ?? '';
	const candidates = note.headings.map((h) => ({ text: h.heading, value: h.heading }));
	const seen = new Set<string>();
	return rankMatches(query, candidates, options.threshold, options.limit * 2)
		.filter((r) => {
			if (seen.has(r.value)) return false;
			seen.add(r.value);
			return true;
		})
		.slice(0, options.limit)
		.map((r) => ({
			kind: 'heading' as const,
			targetPath: note.path,
			label: r.value,
			newSubpath: `#${r.value}`,
			score: r.score,
			confidence: confidenceOf(r.score),
		}));
}

function suggestBlocks(broken: BrokenLink, index: VaultIndex, options: SuggestOptions): Suggestion[] {
	const note = broken.resolvedPath ? index.getNote(broken.resolvedPath) : undefined;
	if (!note) return [];
	const query = broken.subpath.replace(/^#\^/, '');
	const candidates = note.blocks.map((id) => ({ text: id, value: id }));
	return rankMatches(query, candidates, options.threshold, options.limit).map((r) => ({
		kind: 'block' as const,
		targetPath: note.path,
		label: `^${r.value}`,
		newSubpath: `#^${r.value}`,
		score: r.score,
		confidence: confidenceOf(r.score),
	}));
}
