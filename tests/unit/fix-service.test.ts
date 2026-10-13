import { describe, expect, it, vi } from 'vitest';
import { FixService, type EditOutcome, type FixHost, type FixPreview } from '../../src/adapters/fix-service';
import { detectNote } from '../../src/core/detect';
import { applyEdit, type TextEdit } from '../../src/core/edit';
import { note, vault } from '../helpers/build';

/** An in-memory vault standing in for Obsidian. Files keep whatever line endings they were given. */
class FakeHost implements FixHost {
	files = new Map<string, string>();
	trash: string[] = [];
	notices: string[] = [];
	previews: FixPreview[] = [];
	answer = true;

	async applyEdit(path: string, edit: TextEdit): Promise<EditOutcome> {
		const text = this.files.get(path);
		if (text === undefined) return { ok: false, reason: 'missing' };
		const r = applyEdit(text, edit);
		if (!r.ok) return { ok: false, reason: 'stale' };
		this.files.set(path, r.text);
		return { ok: true, edit: r.edit };
	}
	readText(path: string) {
		return Promise.resolve(this.files.get(path) ?? null);
	}
	resolveNewNote(_source: string, folder: string | null, name: string) {
		const path = `${folder ?? 'Inbox'}/${name}.md`;
		return { path, exists: this.files.has(path) };
	}
	createNote(path: string) {
		this.files.set(path, '');
		return Promise.resolve({ ok: true as const });
	}
	trashIfEmpty(path: string) {
		const text = this.files.get(path);
		if (text === undefined) return Promise.resolve('missing' as const);
		if (text.trim() !== '') return Promise.resolve('not-empty' as const);
		this.files.delete(path);
		this.trash.push(path);
		return Promise.resolve('trashed' as const);
	}
	confirm(preview: FixPreview) {
		this.previews.push(preview);
		return Promise.resolve(this.answer);
	}
	notify(message: string) {
		this.notices.push(message);
	}
}

function setup(text: string, original: string, linkText: string, settings = { confirmBeforeFix: true, fuzzyThreshold: 0.4 }) {
	const offset = text.indexOf(original);
	const before = text.slice(0, offset);
	const line = before.split(/\r\n|\n/).length - 1;
	const col = offset - Math.max(before.lastIndexOf('\n') + 1, 0);
	const source = note('Source.md', {
		links: [{ original, link: linkText, start: { line, col, offset }, end: { line, col: col + original.length, offset: offset + original.length } }],
	});
	const index = vault([source, note('Healthy note.md')]);
	const host = new FakeHost();
	host.files.set('Source.md', text);
	const [broken] = detectNote(source, index);
	const fixes = new FixService(host, () => index, () => settings);
	return { host, fixes, broken: broken!, index };
}

describe('FixService', () => {
	it('previews, applies and undoes a suggestion', async () => {
		const text = 'intro\n- see [[Healthy nots]] now\n';
		const { host, fixes, broken } = setup(text, '[[Healthy nots]]', 'Healthy nots');
		const [s] = fixes.suggestions(broken);
		const result = await fixes.run(broken, { kind: 'apply', suggestion: s! });
		expect(result).toBe('applied');
		expect(host.previews[0]).toMatchObject({ lineBefore: '- see [[Healthy nots]] now', lineAfter: '- see [[Healthy note]] now', line: 2 });
		expect(host.files.get('Source.md')).toBe('intro\n- see [[Healthy note]] now\n');
		expect(fixes.canUndo()).toBe(true);
		expect(await fixes.undo()).toBe(true);
		expect(host.files.get('Source.md')).toBe(text);
		expect(fixes.canUndo()).toBe(false);
	});

	it('never changes CRLF line endings, on apply or undo', async () => {
		const text = 'one\r\ntwo [[Healthy nots]]\r\nthree\r\n';
		const { host, fixes, broken } = setup(text, '[[Healthy nots]]', 'Healthy nots');
		const [s] = fixes.suggestions(broken);
		await fixes.run(broken, { kind: 'apply', suggestion: s! });
		expect(host.files.get('Source.md')).toBe('one\r\ntwo [[Healthy note]]\r\nthree\r\n');
		await fixes.undo();
		expect(host.files.get('Source.md')).toBe(text);
	});

	it('writes nothing when the user cancels', async () => {
		const text = '[[Healthy nots]]';
		const { host, fixes, broken } = setup(text, '[[Healthy nots]]', 'Healthy nots');
		host.answer = false;
		const [s] = fixes.suggestions(broken);
		expect(await fixes.run(broken, { kind: 'apply', suggestion: s! })).toBe('cancelled');
		expect(host.files.get('Source.md')).toBe(text);
		expect(fixes.canUndo()).toBe(false);
	});

	it('skips the preview when confirmation is switched off but still supports undo', async () => {
		const text = 'x [[Gone|shown]] y';
		const { host, fixes, broken } = setup(text, '[[Gone|shown]]', 'Gone', { confirmBeforeFix: false, fuzzyThreshold: 0.4 });
		expect(await fixes.run(broken, { kind: 'remove' })).toBe('applied');
		expect(host.previews).toHaveLength(0);
		expect(host.files.get('Source.md')).toBe('x shown y');
		await fixes.undo();
		expect(host.files.get('Source.md')).toBe(text);
	});

	it('refuses to apply to a note that has changed', async () => {
		const { host, fixes, broken } = setup('[[Gone]]', '[[Gone]]', 'Gone');
		host.confirm = () => {
			host.files.set('Source.md', 'the user rewrote everything');
			return Promise.resolve(true);
		};
		expect(await fixes.run(broken, { kind: 'remove' })).toBe('failed');
		expect(host.files.get('Source.md')).toBe('the user rewrote everything');
		expect(host.notices.at(-1)).toContain('changed');
	});

	it('refuses to undo over later edits and says why', async () => {
		const { host, fixes, broken } = setup('[[Gone]]', '[[Gone]]', 'Gone');
		await fixes.run(broken, { kind: 'remove' });
		host.files.set('Source.md', 'completely different');
		expect(await fixes.undo()).toBe(false);
		expect(host.files.get('Source.md')).toBe('completely different');
		expect(host.notices.at(-1)).toContain('Cannot undo');
	});

	it('undoes several fixes in reverse order', async () => {
		const text = 'a [[One]]\nb [[Two]]\n';
		const source = note('S.md', {
			links: [
				{ original: '[[One]]', link: 'One', start: { line: 0, col: 2, offset: 2 }, end: { line: 0, col: 9, offset: 9 } },
				{ original: '[[Two]]', link: 'Two', start: { line: 1, col: 2, offset: 12 }, end: { line: 1, col: 9, offset: 19 } },
			],
		});
		const index = vault([source]);
		const host = new FakeHost();
		host.files.set('S.md', text);
		const fixes = new FixService(host, () => index, () => ({ confirmBeforeFix: false, fuzzyThreshold: 0.4 }));
		const [one, two] = detectNote(source, index);
		await fixes.run(one!, { kind: 'remove' });
		await fixes.run(two!, { kind: 'remove' });
		expect(host.files.get('S.md')).toBe('a One\nb Two\n');
		await fixes.undo();
		expect(host.files.get('S.md')).toBe('a One\nb [[Two]]\n');
		await fixes.undo();
		expect(host.files.get('S.md')).toBe(text);
	});

	it('creates a note, then undoes only while it is still empty', async () => {
		const { host, fixes, broken } = setup('[[Brand new]]', '[[Brand new]]', 'Brand new');
		expect(await fixes.run(broken, { kind: 'create' })).toBe('applied');
		expect(host.files.has('Inbox/Brand new.md')).toBe(true);
		host.files.set('Inbox/Brand new.md', 'I wrote something');
		expect(await fixes.undo()).toBe(false);
		expect(host.files.has('Inbox/Brand new.md')).toBe(true);
		expect(host.trash).toEqual([]);

		const second = setup('[[Another]]', '[[Another]]', 'Another');
		await second.fixes.run(second.broken, { kind: 'create' });
		expect(await second.fixes.undo()).toBe(true);
		expect(second.host.trash).toEqual(['Inbox/Another.md']);
	});

	it('never overwrites an existing note', async () => {
		const { host, fixes, broken } = setup('[[Brand new]]', '[[Brand new]]', 'Brand new');
		host.files.set('Inbox/Brand new.md', 'precious');
		expect(await fixes.run(broken, { kind: 'create' })).toBe('failed');
		expect(host.files.get('Inbox/Brand new.md')).toBe('precious');
	});

	it('notifies listeners when the undo stack changes', async () => {
		const { fixes, broken } = setup('[[Gone]]', '[[Gone]]', 'Gone', { confirmBeforeFix: false, fuzzyThreshold: 0.4 });
		const listener = vi.fn();
		fixes.onChange(listener);
		await fixes.run(broken, { kind: 'remove' });
		await fixes.undo();
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
