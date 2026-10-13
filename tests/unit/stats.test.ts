import { describe, expect, it } from 'vitest';
import { filterBroken, foldersOf, groupByNote, sortGroups, summarise } from '../../src/core/stats';
import type { BrokenLink, BrokenType } from '../../src/core/types';

function b(sourcePath: string, type: BrokenType, original = '[[X]]', target = 'X'): BrokenLink {
	return {
		id: `${sourcePath}:${original}`, sourcePath, type, syntax: 'wikilink', embed: false, original, target, subpath: '',
		start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 },
	};
}

const data = [
	b('A/one.md', 'missing-note', '[[Alpha]]', 'Alpha'),
	b('A/one.md', 'missing-heading'),
	b('A/B/two.md', 'missing-note', '[[Beta]]', 'Beta'),
	b('three.md', 'missing-embed'),
	b('three.md', 'missing-embed'),
	b('three.md', 'missing-block'),
];

describe('summarise', () => {
	it('counts by type and computes the healthy percentage', () => {
		const s = summarise(data, 10, 60);
		expect(s.brokenCount).toBe(6);
		expect(s.healthyPercent).toBe(90);
		expect(s.byType['missing-embed']).toBe(2);
		expect(s.byType['missing-markdown-target']).toBe(0);
	});

	it('is 100 per cent healthy with no links', () => {
		expect(summarise([], 0, 0).healthyPercent).toBe(100);
	});
});

describe('groupByNote and sortGroups', () => {
	it('puts the worst offenders first', () => {
		expect(groupByNote(data).map((g) => [g.sourcePath, g.links.length])).toEqual([
			['three.md', 3], ['A/one.md', 2], ['A/B/two.md', 1],
		]);
	});

	it('sorts by name when asked', () => {
		expect(sortGroups(groupByNote(data), 'name').map((g) => g.sourcePath)).toEqual(['A/B/two.md', 'A/one.md', 'three.md']);
	});
});

describe('filterBroken', () => {
	it('filters by text across note and link, ignoring case', () => {
		expect(filterBroken(data, { text: 'ALPHA' })).toHaveLength(1);
		expect(filterBroken(data, { text: 'two' })).toHaveLength(1);
	});

	it('filters by type and folder', () => {
		expect(filterBroken(data, { types: new Set<BrokenType>(['missing-embed']) })).toHaveLength(2);
		expect(filterBroken(data, { folder: 'A' })).toHaveLength(3);
		expect(filterBroken(data, { folder: 'A/B/' })).toHaveLength(1);
		expect(filterBroken(data, { folder: 'AB' })).toHaveLength(0);
	});

	it('combines filters and treats empty ones as no filter', () => {
		expect(filterBroken(data, { text: '', types: new Set(), folder: '' })).toHaveLength(6);
		expect(filterBroken(data, { folder: 'A', types: new Set<BrokenType>(['missing-note']) })).toHaveLength(2);
	});
});

describe('foldersOf', () => {
	it('lists every folder level', () => {
		expect(foldersOf(data)).toEqual(['A', 'A/B']);
	});
});
