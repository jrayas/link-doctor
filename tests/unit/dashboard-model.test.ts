import { describe, expect, it } from 'vitest';
import { computeDashboard, defaultQuery } from '../../src/ui/dashboard-model';
import type { BrokenLink, BrokenType } from '../../src/core/types';

function b(sourcePath: string, type: BrokenType, original: string, line = 0): BrokenLink {
	return {
		id: `${sourcePath}:${line}`, sourcePath, type, syntax: 'wikilink', embed: false, original, target: original, subpath: '',
		start: { line, col: 0, offset: line * 10 }, end: { line, col: 5, offset: line * 10 + 5 },
	};
}

const broken = [
	b('A/one.md', 'missing-note', '[[Alpha]]', 1),
	b('A/one.md', 'missing-heading', '[[Beta#H]]', 2),
	b('B/two.md', 'missing-note', '[[Gamma]]', 1),
	b('three.md', 'missing-embed', '![[x.png]]', 1),
	b('three.md', 'missing-embed', '![[y.png]]', 2),
	b('three.md', 'missing-block', '[[Delta#^q]]', 3),
];
const base = { broken, noteCount: 10, linkCount: 60 };

describe('computeDashboard', () => {
	it('summarises the whole vault regardless of filters', () => {
		const m = computeDashboard({ ...base, query: { ...defaultQuery(), text: 'alpha' } });
		expect(m.summary.brokenCount).toBe(6);
		expect(m.summary.healthyPercent).toBe(90);
		expect(m.matching).toBe(1);
		expect(m.filtersActive).toBe(true);
	});

	it('lists worst offenders first', () => {
		const m = computeDashboard({ ...base, query: defaultQuery() });
		expect(m.worstOffenders.map((g) => [g.sourcePath, g.links.length])).toEqual([['three.md', 3], ['A/one.md', 2], ['B/two.md', 1]]);
		expect(m.folders).toEqual(['A', 'B']);
	});

	it('groups by note, sorted by count or name', () => {
		const byCount = computeDashboard({ ...base, query: defaultQuery() });
		expect(byCount.groups.map((g) => g.sourcePath)).toEqual(['three.md', 'A/one.md', 'B/two.md']);
		const byName = computeDashboard({ ...base, query: { ...defaultQuery(), sort: 'name' } });
		expect(byName.groups.map((g) => g.sourcePath)).toEqual(['A/one.md', 'B/two.md', 'three.md']);
	});

	it('can show one flat list instead', () => {
		const m = computeDashboard({ ...base, query: { ...defaultQuery(), groupByNote: false } });
		expect(m.groups).toHaveLength(1);
		expect(m.groups[0]?.links).toHaveLength(6);
	});

	it('combines text, type and folder filters', () => {
		const types = new Set<BrokenType>(['missing-note']);
		expect(computeDashboard({ ...base, query: { ...defaultQuery(), types } }).matching).toBe(2);
		expect(computeDashboard({ ...base, query: { ...defaultQuery(), types, folder: 'A' } }).matching).toBe(1);
		expect(computeDashboard({ ...base, query: { ...defaultQuery(), text: 'two' } }).matching).toBe(1);
		expect(computeDashboard({ ...base, query: { ...defaultQuery(), text: 'zzz' } }).groups).toEqual([]);
	});

	it('caps rendered rows across groups and reports the rest as hidden', () => {
		const grouped = computeDashboard({ ...base, query: { ...defaultQuery(), limit: 4 } });
		expect(grouped.groups.map((g) => g.links.length)).toEqual([3, 1]);
		expect(grouped.hidden).toBe(2);
		const flat = computeDashboard({ ...base, query: { ...defaultQuery(), groupByNote: false, limit: 2 } });
		expect(flat.groups[0]?.links).toHaveLength(2);
		expect(flat.hidden).toBe(4);
	});

	it('handles a vault with nothing broken', () => {
		const m = computeDashboard({ broken: [], noteCount: 3, linkCount: 0, query: defaultQuery() });
		expect(m.summary.healthyPercent).toBe(100);
		expect(m.groups).toEqual([]);
		expect(m.filtersActive).toBe(false);
	});
});
