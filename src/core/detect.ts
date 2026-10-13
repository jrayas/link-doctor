import { subpathExists, splitLinktext, VaultIndex } from './resolve';
import { toForwardSlashes } from './text';
import type { BrokenLink, BrokenType, CachedLink, LinkSyntax, NoteSnapshot } from './types';
import { BROKEN_TYPES } from './types';

export interface DetectOptions {
	/** Link types to report; defaults to all five. */
	enabledTypes?: ReadonlySet<BrokenType>;
	/** Notes for which this returns true are skipped. */
	isIgnored?: (path: string) => boolean;
}

export interface ParsedTarget {
	syntax: LinkSyntax;
	embed: boolean;
	/** Decoded path part; empty for same-note links. */
	path: string;
	/** `#Heading` or `#^id`, or an empty string. */
	subpath: string;
	/** True for URLs and other non-local destinations, which are never checked. */
	external: boolean;
}

const SCHEME = /^[a-z][a-z0-9+.-]+:/i;

export function parseTarget(link: CachedLink): ParsedTarget {
	const original = link.original;
	const embed = original.startsWith('!');
	const syntax: LinkSyntax = original.replace(/^!/, '').startsWith('[[') ? 'wikilink' : 'markdown';
	let dest = link.link.trim();
	if (syntax === 'markdown') {
		if (dest.startsWith('<') && dest.endsWith('>')) dest = dest.slice(1, -1);
		if (SCHEME.test(dest) || dest.startsWith('//')) return { syntax, embed, path: dest, subpath: '', external: true };
		dest = safeDecode(dest);
	}
	dest = toForwardSlashes(dest);
	const { path, subpath } = splitLinktext(dest);
	return { syntax, embed, path: path.trim(), subpath: subpath.trim(), external: false };
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** Reports the broken links of one note against the vault index. Pure: no Obsidian API. */
export function detectNote(note: NoteSnapshot, index: VaultIndex, options: DetectOptions = {}): BrokenLink[] {
	const enabled = options.enabledTypes ?? new Set(BROKEN_TYPES);
	if (options.isIgnored?.(note.path)) return [];
	const broken: BrokenLink[] = [];
	for (const link of note.links) {
		const target = parseTarget(link);
		if (target.external) continue;
		const type = classify(target, note.path, index);
		if (type === null || !enabled.has(type)) continue;
		const resolved = target.path === '' ? note.path : (index.resolve(target.path, note.path) ?? undefined);
		broken.push({
			id: `${note.path}:${link.start.line}:${link.start.col}`,
			sourcePath: note.path,
			type,
			syntax: target.syntax,
			embed: target.embed,
			original: link.original,
			target: target.path,
			subpath: target.subpath,
			...(link.displayText !== undefined ? { displayText: link.displayText } : {}),
			...(resolved !== undefined && (type === 'missing-heading' || type === 'missing-block')
				? { resolvedPath: resolved }
				: {}),
			start: link.start,
			end: link.end,
		});
	}
	return broken;
}

function classify(target: ParsedTarget, sourcePath: string, index: VaultIndex): BrokenType | null {
	if (target.path === '' && target.subpath === '') return null;
	const resolved = target.path === '' ? sourcePath : index.resolve(target.path, sourcePath);
	if (resolved === null) {
		if (target.embed) return 'missing-embed';
		return target.syntax === 'markdown' ? 'missing-markdown-target' : 'missing-note';
	}
	if (target.subpath === '') return null;
	const note = index.getNote(resolved);
	// Not a parsed note (an attachment, or a note not yet indexed): never guess.
	if (!note) return null;
	if (subpathExists(target.subpath, note)) return null;
	return target.subpath.startsWith('#^') ? 'missing-block' : 'missing-heading';
}

export function detectAll(index: VaultIndex, options: DetectOptions = {}): BrokenLink[] {
	return index.allNotes().flatMap((note) => detectNote(note, index, options));
}
