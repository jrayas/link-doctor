import { describe, expect, it } from 'vitest';
import {
	detectEol,
	foldName,
	lineAt,
	lineStarts,
	pathLengthWarning,
	positionAt,
	sanitiseFileName,
	snippetAround,
	splitLines,
} from '../../src/core/text';

describe('line endings', () => {
	const lf = 'one\ntwo\nthree';
	const crlf = 'one\r\ntwo\r\nthree';

	it('computes the same line numbers for LF and CRLF', () => {
		expect(lineStarts(lf)).toEqual([0, 4, 8]);
		expect(lineStarts(crlf)).toEqual([0, 5, 10]);
		expect(positionAt(lf, 8)).toEqual({ line: 2, col: 0 });
		expect(positionAt(crlf, 10)).toEqual({ line: 2, col: 0 });
		expect(positionAt(crlf, 6)).toEqual({ line: 1, col: 1 });
	});

	it('returns lines without their endings', () => {
		expect(lineAt(crlf, 6).text).toBe('two');
		expect(lineAt(lf, 5).text).toBe('two');
		expect(splitLines(crlf)).toEqual(['one', 'two', 'three']);
	});

	it('detects the line ending in use', () => {
		expect(detectEol(crlf)).toBe('\r\n');
		expect(detectEol(lf)).toBe('\n');
	});
});

describe('unicode', () => {
	it('treats NFC and NFD names as equal', () => {
		const nfc = 'Café';
		const nfd = 'Café';
		expect(nfc).not.toBe(nfd);
		expect(foldName(nfd)).toBe(foldName(nfc));
	});

	it('ignores case', () => {
		expect(foldName('Healthy NOTE')).toBe(foldName('healthy note'));
	});
});

describe('sanitiseFileName', () => {
	it('replaces characters forbidden on Windows and in links', () => {
		const r = sanitiseFileName('a/b\\c:d*e?f"g<h>i|j#k^l[m]n');
		expect(r.name).toBe('a-b-c-d-e-f-g-h-i-j-k-l-m-n');
		expect(r.changed).toBe(true);
		expect(r.warnings.length).toBeGreaterThan(0);
	});

	it('removes trailing dots and spaces and leading dots', () => {
		expect(sanitiseFileName('Note. . ').name).toBe('Note');
		expect(sanitiseFileName('.hidden').name).toBe('hidden');
	});

	it('avoids Windows reserved names', () => {
		expect(sanitiseFileName('CON').name).toBe('CON-');
		expect(sanitiseFileName('lpt1').name).toBe('lpt1-');
	});

	it('shortens very long names on a code point boundary', () => {
		const r = sanitiseFileName('日'.repeat(200));
		expect(new TextEncoder().encode(r.name).length).toBeLessThanOrEqual(240);
		expect(r.name).toMatch(/^日+$/u);
		expect(r.warnings.some((w) => w.includes('long'))).toBe(true);
	});

	it('falls back to Untitled', () => {
		expect(sanitiseFileName('  ... ').name).toBe('Untitled');
	});

	it('leaves clean names untouched', () => {
		const r = sanitiseFileName('日本語 🙂 Café');
		expect(r.name).toBe('日本語 🙂 Café');
		expect(r.changed).toBe(false);
	});

	it('warns about long full paths', () => {
		expect(pathLengthWarning('a'.repeat(300))).not.toBeNull();
		expect(pathLengthWarning('a/b.md')).toBeNull();
	});
});

describe('snippetAround', () => {
	it('returns short lines whole', () => {
		expect(snippetAround('See [[Note]] here', 4, 8)).toBe('See [[Note]] here');
	});

	it('truncates long lines around the link with ellipses', () => {
		const line = `${'x '.repeat(60)}[[Target]]${' y'.repeat(60)}`;
		const snippet = snippetAround(line, line.indexOf('[['), 10, 60);
		expect(snippet).toContain('[[Target]]');
		expect(snippet.startsWith('…')).toBe(true);
		expect(snippet.endsWith('…')).toBe(true);
	});
});
