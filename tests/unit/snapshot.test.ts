import type { CachedMetadata } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { toSnapshot } from '../../src/adapters/obsidian-port';

const pos = (line: number, col: number, offset: number) => ({ line, col, offset });
const ref = (original: string, link: string, offset: number, displayText?: string) => ({
	original,
	link,
	...(displayText !== undefined ? { displayText } : {}),
	position: { start: pos(offset, 0, offset), end: pos(offset, original.length, offset + original.length) },
});

describe('toSnapshot', () => {
	it('merges links and embeds in document order and copies positions', () => {
		const cache = {
			links: [ref('[[B]]', 'B', 30), ref('[[A]]', 'A', 5, 'A')],
			embeds: [ref('![[pic.png]]', 'pic.png', 12)],
		} as unknown as CachedMetadata;
		const snap = toSnapshot('N.md', cache);
		expect(snap.links.map((l) => l.original)).toEqual(['[[A]]', '![[pic.png]]', '[[B]]']);
		expect(snap.links[0]).toMatchObject({ link: 'A', displayText: 'A', start: { line: 5, col: 0, offset: 5 } });
	});

	it('reads headings, blocks and aliases in every frontmatter shape', () => {
		const base = { headings: [{ heading: 'H', level: 2, position: {} }], blocks: { 'b-1': {}, b2: {} } };
		const list = toSnapshot('N.md', { ...base, frontmatter: { aliases: ['One', ' Two ', 3, ''] } } as unknown as CachedMetadata);
		expect(list.aliases).toEqual(['One', 'Two']);
		expect(list.headings).toEqual([{ heading: 'H', level: 2 }]);
		expect(list.blocks).toEqual(['b-1', 'b2']);
		expect(toSnapshot('N.md', { frontmatter: { aliases: 'a, b' } }).aliases).toEqual(['a', 'b']);
		expect(toSnapshot('N.md', { frontmatter: { alias: 'solo' } }).aliases).toEqual(['solo']);
	});

	it('handles an empty cache', () => {
		expect(toSnapshot('N.md', {})).toEqual({ path: 'N.md', aliases: [], links: [], headings: [], blocks: [] });
	});
});
