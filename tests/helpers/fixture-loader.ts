// Test-only stand-in for Obsidian's metadata cache: parses Markdown into NoteSnapshots.
// It approximates the cache (skips code, reads aliases, headings and block ids). The real
// cache is the ground truth; the dev "dump" command in Phase 4 compares the two.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { VaultIndex } from '../../src/core/resolve';
import { lineStarts } from '../../src/core/text';
import type { CachedLink, HeadingInfo, NoteSnapshot, SourcePos } from '../../src/core/types';

/** Replaces code with spaces of equal length so offsets stay valid. */
function maskCode(text: string): string {
	let masked = text.replace(/(^|\n)(```|~~~)[\s\S]*?(\n\2[^\n]*|$)/g, (m) => m.replace(/[^\r\n]/g, ' '));
	masked = masked.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
	return masked;
}

export function parseNote(path: string, text: string): NoteSnapshot {
	const starts = lineStarts(text);
	const pos = (offset: number): SourcePos => {
		let line = 0;
		while (line + 1 < starts.length && (starts[line + 1] ?? 0) <= offset) line++;
		return { line, col: offset - (starts[line] ?? 0), offset };
	};
	const masked = maskCode(text);
	const links: CachedLink[] = [];
	for (const m of masked.matchAll(/!?\[\[([^[\]]*?)\]\]/g)) {
		const inner = m[1] ?? '';
		const pipe = inner.search(/\\?\|/);
		const link = pipe === -1 ? inner : inner.slice(0, pipe);
		const display = pipe === -1 ? undefined : inner.slice(pipe).replace(/^\\?\|/, '');
		links.push({
			original: text.slice(m.index, m.index + m[0].length),
			link,
			...(display !== undefined ? { displayText: display } : {}),
			start: pos(m.index),
			end: pos(m.index + m[0].length),
		});
	}
	for (const m of masked.matchAll(/!?\[([^\]]*)\]\(([^)]*)\)/g)) {
		const dest = (m[2] ?? '').trim().replace(/\s+["'][^"']*["']$/, '');
		links.push({
			original: text.slice(m.index, m.index + m[0].length),
			link: dest.startsWith('<') && dest.endsWith('>') ? dest.slice(1, -1) : dest,
			displayText: m[1] ?? '',
			start: pos(m.index),
			end: pos(m.index + m[0].length),
		});
	}
	links.sort((a, b) => a.start.offset - b.start.offset);
	const headings: HeadingInfo[] = [];
	for (const m of masked.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
		headings.push({ level: (m[1] ?? '').length, heading: (m[2] ?? '').trim() });
	}
	const blocks = [...masked.matchAll(/\s\^([A-Za-z0-9-]+)[ \t]*$/gm)].map((m) => m[1] ?? '');
	const aliases: string[] = [];
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (fm) {
		const block = /aliases:\s*\n((?:\s+-\s*.+\r?\n?)+)/.exec(fm[1] ?? '');
		for (const line of (block?.[1] ?? '').split(/\r?\n/)) {
			const a = /^\s+-\s*(.+?)\s*$/.exec(line);
			if (a?.[1]) aliases.push(a[1]);
		}
	}
	return { path, aliases, links, headings, blocks };
}

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

/** Loads the fixture vault from disk. Files are read as bytes-as-UTF-8 with line endings intact. */
export function loadFixtureVault(root: string): { index: VaultIndex; texts: Map<string, string> } {
	const index = new VaultIndex();
	const texts = new Map<string, string>();
	for (const file of walk(root)) {
		const path = relative(root, file).split(sep).join('/');
		if (path === 'README.md' || path.startsWith('.')) continue;
		if (path.endsWith('.md')) {
			const text = readFileSync(file, 'utf8');
			texts.set(path, text);
			index.setNote(parseNote(path, text));
		} else {
			index.addFile(path);
		}
	}
	return { index, texts };
}
