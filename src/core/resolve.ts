import type { HeadingInfo, NoteSnapshot } from './types';
import { basename, dirname, foldName, toForwardSlashes } from './text';

const HEADING_SPECIALS = /[!"#$%&()*+,.:;<=>?@^`{|}~/[\]\\\r\n]/g;

/** Mirrors Obsidian's heading normalisation for link matching: punctuation to spaces, case-insensitive. */
export function stripHeading(heading: string): string {
	return foldName(heading.replace(HEADING_SPECIALS, ' ').replace(/\s+/g, ' ').trim());
}

/** Splits `Note#Heading` into the path and the subpath (which keeps its leading `#`). */
export function splitLinktext(linktext: string): { path: string; subpath: string } {
	const i = linktext.indexOf('#');
	return i === -1 ? { path: linktext, subpath: '' } : { path: linktext.slice(0, i), subpath: linktext.slice(i) };
}

/** Collapses `.` and `..` segments. Returns null if the path climbs above the vault root. */
export function resolveRelative(path: string, sourceDir: string): string | null {
	const segments = (sourceDir === '' ? [] : sourceDir.split('/')).concat(path.split('/'));
	const out: string[] = [];
	for (const seg of segments) {
		if (seg === '' || seg === '.') continue;
		if (seg === '..') {
			if (out.length === 0) return null;
			out.pop();
		} else {
			out.push(seg);
		}
	}
	return out.join('/');
}

/**
 * The set of files in a vault plus the parsed notes, with link resolution that follows
 * Obsidian's rules: vault-relative path, then path relative to the source note, then the
 * shortest matching path, preferring the candidate closest to the source. Matching ignores
 * case and Unicode normalisation form, so NFD names from macOS match what users type.
 * The adapter treats `metadataCache.getFirstLinkpathDest` as the ground truth where it can.
 */
export class VaultIndex {
	private readonly files = new Set<string>();
	private readonly byFullKey = new Map<string, string>();
	private readonly byBaseKey = new Map<string, string[]>();
	private readonly notes = new Map<string, NoteSnapshot>();

	addFile(path: string): void {
		if (this.files.has(path)) return;
		this.files.add(path);
		this.byFullKey.set(foldName(path), path);
		const key = foldName(basename(path));
		const list = this.byBaseKey.get(key);
		if (list) list.push(path);
		else this.byBaseKey.set(key, [path]);
	}

	removeFile(path: string): void {
		if (!this.files.delete(path)) return;
		this.byFullKey.delete(foldName(path));
		const key = foldName(basename(path));
		const list = this.byBaseKey.get(key)?.filter((p) => p !== path) ?? [];
		if (list.length > 0) this.byBaseKey.set(key, list);
		else this.byBaseKey.delete(key);
		this.notes.delete(path);
	}

	setNote(snapshot: NoteSnapshot): void {
		this.addFile(snapshot.path);
		this.notes.set(snapshot.path, snapshot);
	}

	hasFile(path: string): boolean {
		return this.files.has(path);
	}

	getNote(path: string): NoteSnapshot | undefined {
		return this.notes.get(path);
	}

	allFiles(): string[] {
		return [...this.files];
	}

	allNotes(): NoteSnapshot[] {
		return [...this.notes.values()];
	}

	/** Number of files that share this file name (case and normalisation insensitive). */
	countByName(name: string): number {
		return this.byBaseKey.get(foldName(name))?.length ?? 0;
	}

	/** Resolves a link path (no `#` part) from `sourcePath`. An empty path means the source itself. */
	resolve(linkpath: string, sourcePath: string): string | null {
		const clean = toForwardSlashes(linkpath).trim();
		if (clean === '') return sourcePath;
		for (const attempt of [clean, `${clean}.md`]) {
			const found = this.resolveExact(attempt, sourcePath);
			if (found) return found;
		}
		return null;
	}

	private resolveExact(path: string, sourcePath: string): string | null {
		const sourceDir = dirname(sourcePath);
		const explicitlyRelative = path.startsWith('./') || path.startsWith('../');
		if (explicitlyRelative) {
			const rel = resolveRelative(path, sourceDir);
			return rel === null ? null : (this.byFullKey.get(foldName(rel)) ?? null);
		}
		const absolute = this.byFullKey.get(foldName(path.replace(/^\/+/, '')));
		if (absolute) return absolute;
		if (sourceDir !== '') {
			const rel = resolveRelative(path, sourceDir);
			const relFound = rel === null ? undefined : this.byFullKey.get(foldName(rel));
			if (relFound) return relFound;
		}
		const key = foldName(path);
		const candidates = (this.byBaseKey.get(foldName(basename(path))) ?? []).filter((p) => {
			const full = foldName(p);
			return full === key || full.endsWith(`/${key}`);
		});
		if (candidates.length === 0) return null;
		return closest(candidates, sourceDir);
	}
}

function commonPrefixLength(a: string, b: string): number {
	const as = a === '' ? [] : a.split('/');
	const bs = b === '' ? [] : b.split('/');
	let n = 0;
	while (n < as.length && n < bs.length && foldName(as[n] ?? '') === foldName(bs[n] ?? '')) n++;
	return n;
}

function closest(candidates: string[], sourceDir: string): string | null {
	const ranked = [...candidates].sort((x, y) => {
		const cx = commonPrefixLength(dirname(x), sourceDir);
		const cy = commonPrefixLength(dirname(y), sourceDir);
		if (cx !== cy) return cy - cx;
		const dx = x.split('/').length;
		const dy = y.split('/').length;
		if (dx !== dy) return dx - dy;
		return x < y ? -1 : x > y ? 1 : 0;
	});
	return ranked[0] ?? null;
}

/** Does `subpath` (`#Heading`, `#A#B` or `#^id`) exist in `note`? */
export function subpathExists(subpath: string, note: NoteSnapshot): boolean {
	if (subpath === '' || subpath === '#') return true;
	if (subpath.startsWith('#^')) {
		const id = foldName(subpath.slice(2));
		return note.blocks.some((b) => foldName(b) === id);
	}
	const parts = subpath
		.slice(1)
		.split('#')
		.map(stripHeading)
		.filter((p) => p !== '');
	if (parts.length === 0) return true;
	return matchHeadingChain(parts, note.headings);
}

function matchHeadingChain(parts: string[], headings: HeadingInfo[]): boolean {
	const normalised = headings.map((h) => stripHeading(h.heading));
	const attempt = (from: number, partIndex: number, parentLevel: number): boolean => {
		const part = parts[partIndex];
		if (part === undefined) return true;
		for (let i = from; i < headings.length; i++) {
			const h = headings[i];
			if (!h) continue;
			if (partIndex > 0 && h.level <= parentLevel) return false;
			if (normalised[i] === part && attempt(i + 1, partIndex + 1, h.level)) return true;
		}
		return false;
	};
	return attempt(0, 0, 0);
}
