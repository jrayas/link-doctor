import { describe, expect, it } from 'vitest';
import { findEmptyNotes } from '../../src/core/checks/empty-notes';
import { VaultIndex } from '../../src/core/resolve';

const note = (path: string, empty?: boolean) => ({ path, aliases: [], links: [], headings: [], blocks: [], ...(empty === undefined ? {} : { empty }) });

describe('findEmptyNotes', () => {
	it('lists only notes flagged empty, sorted, and honours ignore rules', () => {
		const index = new VaultIndex();
		for (const n of [note('b.md', true), note('a.md', true), note('full.md', false), note('unknown.md'), note('Templates/t.md', true)]) index.setNote(n);
		expect(findEmptyNotes(index)).toEqual(['a.md', 'b.md', 'Templates/t.md']);
		expect(findEmptyNotes(index, (p) => p.startsWith('Templates/'))).toEqual(['a.md', 'b.md']);
	});
});
