import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectAll } from '../../src/core/detect';
import { compileIgnoreRules } from '../../src/core/ignore';
import type { BrokenType } from '../../src/core/types';
import { loadFixtureVault } from '../helpers/fixture-loader';

const root = fileURLToPath(new URL('../../test-vault', import.meta.url));
const { index, texts } = loadFixtureVault(root);

// Keep in step with test-vault/README.md.
const expectedPerNote: Record<string, number> = {
	'Broken/Missing notes.md': 3,
	'Broken/Missing headings.md': 4,
	'Broken/Missing blocks.md': 2,
	'Broken/Missing embeds.md': 3,
	'Broken/Missing markdown links.md': 3,
	'Edge/Unicode.md': 2,
	'Edge/crlf-note.md': 2,
	'Edge/Aliases.md': 1,
	'Folder with spaces/Relative.md': 1,
	'Templates/Template.md': 2,
};

function countsBy(broken: ReturnType<typeof detectAll>) {
	const perNote: Record<string, number> = {};
	const perType: Partial<Record<BrokenType, number>> = {};
	for (const b of broken) {
		perNote[b.sourcePath] = (perNote[b.sourcePath] ?? 0) + 1;
		perType[b.type] = (perType[b.type] ?? 0) + 1;
	}
	return { perNote, perType };
}

describe('fixture vault', () => {
	it('reports the expected broken links per note', () => {
		const { perNote } = countsBy(detectAll(index));
		expect(perNote).toEqual(expectedPerNote);
	});

	it('covers all five types with the expected totals when ignoring Templates', () => {
		const broken = detectAll(index, { isIgnored: compileIgnoreRules(['Templates/']) });
		const { perType } = countsBy(broken);
		expect(broken).toHaveLength(21);
		expect(perType).toEqual({
			'missing-note': 9,
			'missing-heading': 5,
			'missing-block': 2,
			'missing-embed': 3,
			'missing-markdown-target': 2,
		});
	});

	it('reports no false positives on healthy notes', () => {
		const { perNote } = countsBy(detectAll(index));
		for (const healthy of ['Home.md', 'Healthy note.md', 'Edge/Case.md', 'Folder with spaces/Spaced note.md']) {
			expect(perNote[healthy]).toBeUndefined();
		}
	});

	it('ignores links inside code', () => {
		const sources = detectAll(index).filter((b) => b.sourcePath === 'Broken/Missing notes.md').map((b) => b.original);
		expect(sources.some((s) => s.includes('Not a link'))).toBe(false);
	});

	it('gives correct line numbers in a CRLF note', () => {
		const text = texts.get('Edge/crlf-note.md') ?? '';
		expect(text.includes('\r\n')).toBe(true);
		const lines = detectAll(index)
			.filter((b) => b.sourcePath === 'Edge/crlf-note.md')
			.map((b) => b.start.line);
		expect(lines).toEqual([4, 5]);
		for (const b of detectAll(index).filter((x) => x.sourcePath === 'Edge/crlf-note.md')) {
			expect(text.slice(b.start.offset, b.end.offset)).toBe(b.original);
		}
	});
});
