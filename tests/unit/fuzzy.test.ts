import { describe, expect, it } from 'vitest';
import { confidenceOf, rankMatches, similarity } from '../../src/core/fuzzy';
import { suggestFor } from '../../src/core/suggest';
import { detectNote } from '../../src/core/detect';
import { link, note, vault } from '../helpers/build';

describe('similarity', () => {
	it('scores identical names 1 regardless of case or Unicode form', () => {
		expect(similarity('Café', 'Café')).toBe(1);
		expect(similarity('HELLO', 'hello')).toBe(1);
	});

	it('scores an accent-only difference just below exact', () => {
		const s = similarity('Cafe', 'Café');
		expect(s).toBeGreaterThan(0.9);
		expect(s).toBeLessThan(1);
	});

	it('scores typos high and unrelated names low', () => {
		expect(similarity('Healthy nots', 'Healthy note')).toBeGreaterThan(0.85);
		expect(similarity('Does not exist', 'Healthy note')).toBeLessThan(0.4);
	});

	it('works on CJK and emoji by code point', () => {
		expect(similarity('日本語のノート', '日本語ノート')).toBeGreaterThan(0.7);
		expect(similarity('🙂 Emoji note', '🙂 Emoji notes')).toBeGreaterThan(0.85);
	});

	it('rewards containment', () => {
		expect(similarity('Meeting', 'Meeting notes 2026')).toBeGreaterThan(0.6);
	});

	it('handles empty input', () => {
		expect(similarity('', 'a')).toBe(0);
	});
});

describe('rankMatches', () => {
	const candidates = ['Healthy note', 'Home', 'Heal', 'Zebra'].map((text) => ({ text, value: text }));

	it('ranks best first and applies threshold and limit', () => {
		const r = rankMatches('Healthy nots', candidates, 0.4, 2);
		expect(r.map((x) => x.value)).toEqual(['Healthy note', 'Heal']);
		expect(rankMatches('Healthy nots', candidates, 0.99, 5)).toEqual([]);
	});

	it('is deterministic on ties', () => {
		const tied = [{ text: 'bb', value: 1 }, { text: 'ba', value: 2 }];
		expect(rankMatches('b', tied, 0, 5).map((x) => x.value)).toEqual(rankMatches('b', [...tied].reverse(), 0, 5).map((x) => x.value));
	});
});

describe('confidenceOf', () => {
	it('buckets scores', () => {
		expect(confidenceOf(0.9)).toBe('high');
		expect(confidenceOf(0.7)).toBe('medium');
		expect(confidenceOf(0.3)).toBe('low');
	});
});

describe('suggestFor', () => {
	const healthy = note('Healthy note.md', {
		aliases: ['Healthy alias'],
		headings: [{ heading: 'Section one', level: 2 }, { heading: 'Section two', level: 2 }],
		blocks: ['block-a'],
	});
	const opts = { threshold: 0.4, limit: 3 };

	function brokenFor(original: string, linkText: string) {
		const source = note('S.md', { links: [link(original, linkText)] });
		const index = vault([source, healthy, note('Café.md')], ['diagram.png', 'photo.png']);
		const [b] = detectNote(source, index);
		if (!b) throw new Error('expected a broken link');
		return { b, index };
	}

	it('suggests a close note name', () => {
		const { b, index } = brokenFor('[[Healthy nots]]', 'Healthy nots');
		const [first] = suggestFor(b, index, opts);
		expect(first).toMatchObject({ kind: 'note', targetPath: 'Healthy note.md', confidence: 'high' });
	});

	it('matches through aliases', () => {
		const { b, index } = brokenFor('[[Healthy aliass]]', 'Healthy aliass');
		const [first] = suggestFor(b, index, opts);
		expect(first).toMatchObject({ targetPath: 'Healthy note.md', viaAlias: 'Healthy alias' });
	});

	it('offers each target only once', () => {
		const { b, index } = brokenFor('[[Healthy]]', 'Healthy');
		const paths = suggestFor(b, index, opts).map((s) => s.targetPath);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it('suggests the accented name for a missing accent', () => {
		const { b, index } = brokenFor('[[Cafe]]', 'Cafe');
		expect(suggestFor(b, index, opts)[0]?.targetPath).toBe('Café.md');
	});

	it('suggests similar headings and blocks', () => {
		const h = brokenFor('[[Healthy note#Section won]]', 'Healthy note#Section won');
		expect(suggestFor(h.b, h.index, opts)[0]).toMatchObject({ kind: 'heading', newSubpath: '#Section one' });
		const bl = brokenFor('[[Healthy note#^block-b]]', 'Healthy note#^block-b');
		expect(suggestFor(bl.b, bl.index, opts)[0]).toMatchObject({ kind: 'block', newSubpath: '#^block-a' });
	});

	it('suggests attachments of the same type for missing embeds', () => {
		const { b, index } = brokenFor('![[diagrams.png]]', 'diagrams.png');
		const [first] = suggestFor(b, index, opts);
		expect(first).toMatchObject({ kind: 'file', targetPath: 'diagram.png' });
	});

	it('suggests nothing when nothing is close', () => {
		const { b, index } = brokenFor('[[Qqqqq xxxx]]', 'Qqqqq xxxx');
		expect(suggestFor(b, index, { threshold: 0.6, limit: 3 })).toEqual([]);
	});

	it('respects the limit', () => {
		const { b, index } = brokenFor('[[Healthy]]', 'Healthy');
		expect(suggestFor(b, index, { threshold: 0, limit: 1 })).toHaveLength(1);
	});
});
