import { describe, expect, it } from 'vitest';
import { detectNote } from '../../src/core/detect';
import { canCreateNote, newNoteRequest, planFix } from '../../src/core/fix';
import { suggestFor } from '../../src/core/suggest';
import { UndoStack } from '../../src/core/undo-stack';
import { link, note, vault } from '../helpers/build';

const healthy = note('Notes/Healthy note.md', {
	headings: [{ heading: 'Section one', level: 2 }],
	blocks: ['block-a'],
});

function setup(original: string, linkText: string, extraFiles: string[] = []) {
	const source = note('Source.md', { links: [link(original, linkText, 3)] });
	const index = vault([source, healthy, note('Café.md')], extraFiles);
	const [broken] = detectNote(source, index);
	if (!broken) throw new Error('expected a broken link');
	return { broken, index };
}

describe('planFix apply', () => {
	it('swaps the note but keeps alias and heading', () => {
		const { broken, index } = setup('[[Healthy nots#Section one|shown]]', 'Healthy nots#Section one');
		const [s] = suggestFor(broken, index, { threshold: 0.4, limit: 1 });
		if (!s) throw new Error('no suggestion');
		const r = planFix(broken, { kind: 'apply', suggestion: s }, index);
		expect(r.ok && r.plan.edit).toEqual({
			start: broken.start.offset,
			before: '[[Healthy nots#Section one|shown]]',
			after: '[[Healthy note#Section one|shown]]',
		});
	});

	it('fixes only the heading part', () => {
		const { broken, index } = setup('[[Healthy note#Section won]]', 'Healthy note#Section won');
		const [s] = suggestFor(broken, index, { threshold: 0.4, limit: 1 });
		const r = planFix(broken, { kind: 'apply', suggestion: s! }, index);
		expect(r.ok && r.plan.edit?.after).toBe('[[Healthy note#Section one]]');
	});

	it('keeps a Markdown link as a Markdown link', () => {
		const { broken, index } = setup('[words](Healthy%20nots.md)', 'Healthy%20nots.md');
		const [s] = suggestFor(broken, index, { threshold: 0.4, limit: 1 });
		const r = planFix(broken, { kind: 'apply', suggestion: s! }, index);
		expect(r.ok && r.plan.edit?.after).toBe('[words](Notes/Healthy%20note.md)');
	});

	it('keeps an embed as an embed', () => {
		const { broken, index } = setup('![[diagrams.png]]', 'diagrams.png', ['img/diagram.png']);
		const [s] = suggestFor(broken, index, { threshold: 0.4, limit: 1 });
		const r = planFix(broken, { kind: 'apply', suggestion: s! }, index);
		expect(r.ok && r.plan.edit?.after).toBe('![[diagram.png]]');
	});

	it('rejects a suggestion identical to the current link', () => {
		const { broken, index } = setup('[[Healthy nots]]', 'Healthy nots');
		const same = { kind: 'note' as const, targetPath: 'Notes/Healthy note.md', label: 'x', score: 1, confidence: 'high' as const };
		const noop = planFix({ ...broken, original: '[[Healthy note]]' }, { kind: 'apply', suggestion: same }, index);
		expect(noop.ok).toBe(false);
	});
});

describe('planFix remove and create', () => {
	it('removes the link but keeps the text', () => {
		const { broken, index } = setup('[[Gone|shown text]]', 'Gone');
		const r = planFix(broken, { kind: 'remove' }, index);
		expect(r.ok && r.plan.edit).toMatchObject({ before: '[[Gone|shown text]]', after: 'shown text' });
	});

	it('plans note creation without a text edit', () => {
		const { broken, index } = setup('[[Brand new]]', 'Brand new');
		const r = planFix(broken, { kind: 'create' }, index);
		expect(r.ok && r.plan.edit).toBeUndefined();
		expect(r.ok && r.plan.create).toMatchObject({ folder: null, name: 'Brand new', warnings: [] });
	});

	it('refuses to create notes for embeds and headings', () => {
		const embed = setup('![[nothing.png]]', 'nothing.png').broken;
		expect(canCreateNote(embed)).toBe(false);
		expect(planFix(embed, { kind: 'create' }, vault([])).ok).toBe(false);
		const heading = setup('[[Healthy note#Zzz]]', 'Healthy note#Zzz').broken;
		expect(canCreateNote(heading)).toBe(false);
	});
});

describe('newNoteRequest', () => {
	it('sanitises unsafe names and warns', () => {
		const { broken } = setup('[[What? A:note]]', 'What? A:note');
		const req = newNoteRequest(broken);
		expect(req.name).toBe('What- A-note');
		expect(req.warnings.length).toBeGreaterThan(0);
	});

	it('keeps a folder named in the link', () => {
		const { broken } = setup('[[Projects/Plan]]', 'Projects/Plan');
		expect(newNoteRequest(broken)).toMatchObject({ folder: 'Projects', name: 'Plan' });
	});

	it('warns about very long paths', () => {
		const long = 'a'.repeat(250);
		const { broken } = setup(`[[${long}]]`, long);
		expect(newNoteRequest(broken).warnings.some((w) => w.includes('long'))).toBe(true);
	});

	it('allows Markdown links to missing notes', () => {
		const { broken } = setup('[x](New%20note.md)', 'New%20note.md');
		expect(canCreateNote(broken)).toBe(true);
		expect(newNoteRequest(broken).name).toBe('New note');
	});
});

describe('UndoStack', () => {
	it('is last in, first out and bounded', () => {
		const s = new UndoStack<number>(2);
		s.push(1);
		s.push(2);
		s.push(3);
		expect(s.size).toBe(2);
		expect(s.peek()).toBe(3);
		expect(s.pop()).toBe(3);
		expect(s.pop()).toBe(2);
		expect(s.pop()).toBeUndefined();
	});
});
