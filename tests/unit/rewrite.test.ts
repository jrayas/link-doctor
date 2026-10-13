import { describe, expect, it } from 'vitest';
import { applyEdit, invertEdit, previewEdit } from '../../src/core/edit';
import { linkPathFor, parseLinkText, removeLinkKeepText, retarget } from '../../src/core/rewrite';
import { note, vault } from '../helpers/build';

describe('parseLinkText', () => {
	it('parses wikilinks with every part', () => {
		expect(parseLinkText('![[Note#Head|alias text]]')).toMatchObject({
			kind: 'wikilink', embed: true, path: 'Note', subpath: '#Head', alias: 'alias text',
		});
		expect(parseLinkText('[[Note\\|x]]')).toMatchObject({ escapedPipe: true, alias: 'x' });
	});

	it('parses Markdown links with titles and angle brackets', () => {
		expect(parseLinkText('[t](<a b.md> "Title")')).toMatchObject({ kind: 'markdown', angle: true, dest: 'a b.md', title: ' "Title"' });
		expect(parseLinkText('plain text')).toBeNull();
	});
});

describe('retarget', () => {
	it('keeps alias, heading and embed marker when only the path changes', () => {
		expect(retarget('[[Old#Head|shown]]', { path: 'New' })).toBe('[[New#Head|shown]]');
		expect(retarget('![[Old]]', { path: 'New' })).toBe('![[New]]');
	});

	it('keeps path and alias when only the subpath changes', () => {
		expect(retarget('[[Note#Wrong|shown]]', { subpath: '#Right' })).toBe('[[Note#Right|shown]]');
		expect(retarget('[[Note#^wrong]]', { subpath: '#^right' })).toBe('[[Note#^right]]');
		expect(retarget('[[Note#Wrong]]', { subpath: '' })).toBe('[[Note]]');
	});

	it('keeps an escaped pipe for use inside tables', () => {
		expect(retarget('[[Old\\|alias]]', { path: 'New' })).toBe('[[New\\|alias]]');
	});

	it('keeps the Markdown style, text, title and encoding', () => {
		expect(retarget('[text](Old%20note.md)', { path: 'Folder/New note.md' })).toBe('[text](Folder/New%20note.md)');
		expect(retarget('[text](<Old note.md> "T")', { path: 'New note.md' })).toBe('[text](<New note.md> "T")');
		expect(retarget('![alt](old.png)', { path: 'img/new.png' })).toBe('![alt](img/new.png)');
		expect(retarget('[t](Note.md#Wrong)', { subpath: '#Right one' })).toBe('[t](Note.md#Right%20one)');
	});

	it('returns null for text it cannot parse', () => {
		expect(retarget('not a link', { path: 'x' })).toBeNull();
	});
});

describe('removeLinkKeepText', () => {
	it('keeps the alias, or the readable name', () => {
		expect(removeLinkKeepText('[[Gone|shown]]')).toBe('shown');
		expect(removeLinkKeepText('[[Folder/Gone]]')).toBe('Gone');
		expect(removeLinkKeepText('[[Gone#Head]]')).toBe('Gone > Head');
		expect(removeLinkKeepText('[[#Head]]')).toBe('Head');
		expect(removeLinkKeepText('[[Gone#^id]]')).toBe('Gone');
	});

	it('keeps Markdown link text, falling back to the file name', () => {
		expect(removeLinkKeepText('[words](Missing.md)')).toBe('words');
		expect(removeLinkKeepText('![](images/gone%20pic.png)')).toBe('gone pic.png');
	});
});

describe('linkPathFor', () => {
	const index = vault([note('A/Plan.md'), note('B/Plan.md'), note('Unique.md')], ['img/pic.png']);

	it('uses the bare name when it resolves to the same file', () => {
		expect(linkPathFor('Unique.md', 'x.md', index, 'wikilink')).toBe('Unique');
		expect(linkPathFor('img/pic.png', 'x.md', index, 'wikilink')).toBe('pic.png');
	});

	it('uses the full path when the bare name is ambiguous or preferred', () => {
		expect(linkPathFor('B/Plan.md', 'A/x.md', index, 'wikilink')).toBe('B/Plan');
		expect(linkPathFor('Unique.md', 'x.md', index, 'wikilink', true)).toBe('Unique');
		expect(linkPathFor('B/Plan.md', 'x.md', index, 'wikilink', true)).toBe('B/Plan');
	});

	it('keeps the extension and full path for Markdown links', () => {
		expect(linkPathFor('A/Plan.md', 'x.md', index, 'markdown')).toBe('A/Plan.md');
	});
});

describe('applyEdit', () => {
	const lf = 'first\n- [[Old]] here\nlast\n';
	const crlf = lf.replace(/\n/g, '\r\n');

	it('replaces only the span and preserves LF', () => {
		const start = lf.indexOf('[[Old]]');
		const r = applyEdit(lf, { start, before: '[[Old]]', after: '[[New]]' });
		expect(r.ok && r.text).toBe('first\n- [[New]] here\nlast\n');
	});

	it('preserves CRLF exactly', () => {
		const start = crlf.indexOf('[[Old]]');
		const r = applyEdit(crlf, { start, before: '[[Old]]', after: '[[New]]' });
		expect(r.ok && r.text).toBe('first\r\n- [[New]] here\r\nlast\r\n');
		expect(r.ok && r.text.includes('\r\n')).toBe(true);
		expect(r.ok && r.text.replace(/\r\n/g, '').includes('\n')).toBe(false);
		expect(r.ok && r.line).toBe(1);
	});

	it('provides before and after lines for the preview', () => {
		const p = previewEdit(crlf, { start: crlf.indexOf('[[Old]]'), before: '[[Old]]', after: '[[New]]' });
		expect(p).toEqual({ before: '- [[Old]] here', after: '- [[New]] here', line: 1 });
	});

	it('relocates the span if the text shifted but it is unique', () => {
		const shifted = `extra line\n${lf}`;
		const r = applyEdit(shifted, { start: lf.indexOf('[[Old]]'), before: '[[Old]]', after: '[[New]]' });
		expect(r.ok && r.text).toContain('[[New]]');
	});

	it('refuses when the text changed or is ambiguous', () => {
		expect(applyEdit('nothing here', { start: 0, before: '[[Old]]', after: '[[New]]' })).toEqual({ ok: false, reason: 'stale' });
		const twice = '[[Old]] and [[Old]]';
		expect(applyEdit(twice, { start: 99, before: '[[Old]]', after: '[[New]]' })).toEqual({ ok: false, reason: 'stale' });
	});

	it('undoes exactly, even with CRLF', () => {
		const edit = { start: crlf.indexOf('[[Old]]'), before: '[[Old]]', after: '[[New]]' };
		const applied = applyEdit(crlf, edit);
		if (!applied.ok) throw new Error('apply failed');
		const undone = applyEdit(applied.text, invertEdit(applied.edit));
		expect(undone.ok && undone.text).toBe(crlf);
	});

	it('refuses to undo over text the user has since changed', () => {
		const edit = { start: 0, before: '[[Old]]', after: '[[New]]' };
		expect(applyEdit('[[Edited by user]]', invertEdit(edit))).toEqual({ ok: false, reason: 'stale' });
	});
});
