import { describe, expect, it } from 'vitest';
import { detectAll, detectNote, parseTarget } from '../../src/core/detect';
import type { BrokenType } from '../../src/core/types';
import { link, note, vault } from '../helpers/build';

const target = note('Target.md', {
	headings: [{ heading: 'Real', level: 2 }],
	blocks: ['abc'],
});

function broken(links: ReturnType<typeof link>[], extra: ReturnType<typeof note>[] = [], files: string[] = []) {
	const source = note('Source.md', { links });
	const index = vault([source, target, ...extra], files);
	return detectNote(source, index);
}

describe('parseTarget', () => {
	it('parses wikilinks and embeds', () => {
		expect(parseTarget(link('![[A#B|x]]', 'A#B'))).toMatchObject({ syntax: 'wikilink', embed: true, path: 'A', subpath: '#B' });
	});

	it('decodes Markdown destinations and strips angle brackets', () => {
		expect(parseTarget(link('[x](My%20note.md)', 'My%20note.md'))).toMatchObject({ syntax: 'markdown', path: 'My note.md' });
		expect(parseTarget(link('[x](<My note.md#H>)', '<My note.md#H>'))).toMatchObject({ path: 'My note.md', subpath: '#H' });
	});

	it('survives malformed percent-encoding and backslashes', () => {
		expect(parseTarget(link('[x](100%.md)', '100%.md')).path).toBe('100%.md');
		expect(parseTarget(link('[x](a\\b.md)', 'a\\b.md')).path).toBe('a/b.md');
	});

	it('flags external destinations', () => {
		expect(parseTarget(link('[x](https://a.b)', 'https://a.b')).external).toBe(true);
		expect(parseTarget(link('[x](mailto:a@b.c)', 'mailto:a@b.c')).external).toBe(true);
		expect(parseTarget(link('![x](//cdn.example/i.png)', '//cdn.example/i.png')).external).toBe(true);
		expect(parseTarget(link('[x](obsidian://open?vault=a)', 'obsidian://open?vault=a')).external).toBe(true);
	});
});

describe('detection of the five link types', () => {
	it('1: wikilink to a missing note', () => {
		const result = broken([link('[[Nope]]', 'Nope')]);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ type: 'missing-note', target: 'Nope', syntax: 'wikilink', embed: false });
	});

	it('2: wikilink to a missing heading', () => {
		const result = broken([link('[[Target#Gone]]', 'Target#Gone')]);
		expect(result[0]).toMatchObject({ type: 'missing-heading', subpath: '#Gone', resolvedPath: 'Target.md' });
	});

	it('3: wikilink to a missing block', () => {
		const result = broken([link('[[Target#^zzz]]', 'Target#^zzz')]);
		expect(result[0]).toMatchObject({ type: 'missing-block', subpath: '#^zzz', resolvedPath: 'Target.md' });
	});

	it('4: embed of a missing file, note or attachment', () => {
		const result = broken([link('![[pic.png]]', 'pic.png', 0), link('![[Gone note]]', 'Gone note', 1), link('![x](img/a.png)', 'img/a.png', 2)]);
		expect(result.map((r) => r.type)).toEqual(['missing-embed', 'missing-embed', 'missing-embed']);
	});

	it('5: Markdown link to a missing local file', () => {
		const result = broken([link('[x](Missing%20file.md)', 'Missing%20file.md')]);
		expect(result[0]).toMatchObject({ type: 'missing-markdown-target', target: 'Missing file.md' });
	});

	it('reports a missing heading in a Markdown link as a heading problem', () => {
		const result = broken([link('[x](Target.md#Gone)', 'Target.md#Gone')]);
		expect(result[0]?.type).toBe('missing-heading');
	});

	it('reports nothing for healthy links', () => {
		const result = broken(
			[
				link('[[Target]]', 'Target', 0),
				link('[[Target#Real]]', 'Target#Real', 1),
				link('[[Target#^abc]]', 'Target#^abc', 2),
				link('![[pic.png]]', 'pic.png', 3),
				link('[x](Target.md)', 'Target.md', 4),
				link('[ext](https://example.com)', 'https://example.com', 5),
			],
			[],
			['pic.png'],
		);
		expect(result).toEqual([]);
	});

	it('does not validate subpaths on attachments or unindexed notes', () => {
		const source = note('S.md', { links: [link('[[doc.pdf#page=3]]', 'doc.pdf#page=3')] });
		const index = vault([source], ['doc.pdf']);
		expect(detectNote(source, index)).toEqual([]);
	});

	it('checks same-note subpaths against the source note', () => {
		const source = note('S.md', {
			links: [link('[[#Mine]]', '#Mine', 0), link('[[#Absent]]', '#Absent', 1), link('[[#^nope]]', '#^nope', 2)],
			headings: [{ heading: 'Mine', level: 1 }],
		});
		const result = detectNote(source, vault([source]));
		expect(result.map((r) => r.type)).toEqual(['missing-heading', 'missing-block']);
	});

	it('records position and a stable id', () => {
		const result = broken([link('[[Nope]]', 'Nope', 3)]);
		expect(result[0]).toMatchObject({ id: 'Source.md:3:0', start: { line: 3, col: 0 } });
	});
});

describe('options', () => {
	it('respects enabled types', () => {
		const source = note('S.md', { links: [link('[[Nope]]', 'Nope', 0), link('![[x.png]]', 'x.png', 1)] });
		const index = vault([source]);
		const only = new Set<BrokenType>(['missing-embed']);
		expect(detectNote(source, index, { enabledTypes: only }).map((b) => b.type)).toEqual(['missing-embed']);
	});

	it('skips ignored notes', () => {
		const source = note('Templates/T.md', { links: [link('[[Nope]]', 'Nope')] });
		const index = vault([source]);
		expect(detectNote(source, index, { isIgnored: (p) => p.startsWith('Templates/') })).toEqual([]);
	});
});

describe('platform edge cases', () => {
	it('finds NFD links to NFC files healthy', () => {
		const source = note('S.md', { links: [link('[[Café]]', 'Café')] });
		expect(detectNote(source, vault([source, note('Café.md')]))).toEqual([]);
	});

	it('is not fooled by case differences', () => {
		const source = note('S.md', { links: [link('[[target]]', 'target')] });
		expect(detectNote(source, vault([source, target]))).toEqual([]);
	});

	it('treats a bare alias as unresolved', () => {
		const source = note('S.md', { links: [link('[[Nickname]]', 'Nickname')] });
		const index = vault([source, note('Real.md', { aliases: ['Nickname'] })]);
		expect(detectNote(source, index)[0]?.type).toBe('missing-note');
	});

	it('detectAll covers every note', () => {
		const a = note('A.md', { links: [link('[[X]]', 'X')] });
		const b = note('B.md', { links: [link('[[Y]]', 'Y')] });
		expect(detectAll(vault([a, b]))).toHaveLength(2);
	});
});
