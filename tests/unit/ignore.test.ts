import { describe, expect, it } from 'vitest';
import { compileIgnoreRules } from '../../src/core/ignore';

describe('ignore rules', () => {
	it('ignores a folder and its contents', () => {
		const ignored = compileIgnoreRules(['Templates/']);
		expect(ignored('Templates/Daily.md')).toBe(true);
		expect(ignored('Projects/Templates/Daily.md')).toBe(true);
		expect(ignored('Templates.md')).toBe(false);
	});

	it('anchors rules that contain a slash', () => {
		const ignored = compileIgnoreRules(['Archive/Old']);
		expect(ignored('Archive/Old/a.md')).toBe(true);
		expect(ignored('Other/Archive/Old/a.md')).toBe(false);
	});

	it('supports * and ** wildcards', () => {
		const ignored = compileIgnoreRules(['*.excalidraw.md', 'Logs/**/draft-*.md']);
		expect(ignored('Sketch.excalidraw.md')).toBe(true);
		expect(ignored('a/b/Sketch.excalidraw.md')).toBe(true);
		expect(ignored('Logs/2026/05/draft-1.md')).toBe(true);
		expect(ignored('Logs/draft-1.md')).toBe(true);
		expect(ignored('Logs/final.md')).toBe(false);
	});

	it('ignores case, Unicode form, comments and blank lines', () => {
		const ignored = compileIgnoreRules(['# comment', '', '  ', 'café/']);
		expect(ignored('CAFÉ/note.md')).toBe(true);
		expect(ignored('other/note.md')).toBe(false);
	});

	it('treats regex characters literally and never throws', () => {
		const ignored = compileIgnoreRules(['(unclosed', 'a+b.md', '[bad']);
		expect(ignored('a+b.md')).toBe(true);
		expect(ignored('aab.md')).toBe(false);
	});

	it('accepts backslash separators', () => {
		expect(compileIgnoreRules(['Templates\\'])('Templates/x.md')).toBe(true);
		expect(compileIgnoreRules(['Templates/'])('Templates\\x.md')).toBe(true);
	});

	it('ignores nothing when there are no rules', () => {
		expect(compileIgnoreRules([])('anything.md')).toBe(false);
	});
});

describe('findRegexLikeRules', () => {
	it('flags rules that look like regular expressions but not plain globs', async () => {
		const { findRegexLikeRules } = await import('../../src/core/ignore');
		expect(findRegexLikeRules(['^Archive/.*$', '(a|b)', 'Templates/', '*.md', '**/draft-*', '# (comment)'])).toEqual(['^Archive/.*$', '(a|b)']);
	});
});
