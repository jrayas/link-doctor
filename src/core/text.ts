/** Text helpers that never assume a platform: LF, CRLF and Unicode normalisation forms all work. */

const COMBINING_MARKS = /\p{M}/gu;

/** NFC form: macOS may store NFD names while users type NFC. */
export function nfc(value: string): string {
	return value.normalize('NFC');
}

/** Key used to compare names: NFC and lower case. */
export function foldName(value: string): string {
	return nfc(value).toLowerCase();
}

/** Like `foldName` but also removes accents; for fuzzy comparison only. */
export function foldLoose(value: string): string {
	return value.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC').toLowerCase();
}

export function toForwardSlashes(value: string): string {
	return value.replace(/\\/g, '/');
}

export function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
	const i = path.lastIndexOf('/');
	return i === -1 ? '' : path.slice(0, i);
}

export function stripExtension(name: string): string {
	const i = name.lastIndexOf('.');
	return i > 0 ? name.slice(0, i) : name;
}

export function extensionOf(name: string): string {
	const i = name.lastIndexOf('.');
	return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** `\r\n` if the text uses it, otherwise `\n`. */
export function detectEol(text: string): '\r\n' | '\n' {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

export function splitLines(text: string): string[] {
	return text.split(/\r\n|\n|\r/);
}

/** Offsets at which each line starts, treating `\r\n`, `\n` and lone `\r` as line breaks. */
export function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c === 13) {
			if (text.charCodeAt(i + 1) === 10) i++;
			starts.push(i + 1);
		} else if (c === 10) {
			starts.push(i + 1);
		}
	}
	return starts;
}

/** Zero-based line and column for an offset. */
export function positionAt(text: string, offset: number): { line: number; col: number } {
	const starts = lineStarts(text);
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((starts[mid] ?? 0) <= offset) lo = mid;
		else hi = mid - 1;
	}
	return { line: lo, col: offset - (starts[lo] ?? 0) };
}

/** The line containing `offset`, without its line ending. */
export function lineAt(text: string, offset: number): { text: string; line: number; start: number } {
	const { line } = positionAt(text, offset);
	const start = lineStarts(text)[line] ?? 0;
	let end = start;
	while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end++;
	return { text: text.slice(start, end), line, start };
}

/** A short single-line snippet around a link, for list rows. */
export function snippetAround(text: string, offset: number, length: number, maxLength = 80): string {
	const line = lineAt(text, offset);
	const collapsed = line.text.replace(/\s+/g, ' ').trim();
	if (collapsed.length <= maxLength) return collapsed;
	const rel = Math.max(0, offset - line.start);
	const approx = Math.min(collapsed.length, Math.round(rel));
	const half = Math.floor((maxLength - length) / 2);
	const from = Math.max(0, Math.min(approx - Math.max(half, 8), collapsed.length - maxLength));
	const slice = collapsed.slice(from, from + maxLength);
	return `${from > 0 ? '…' : ''}${slice}${from + maxLength < collapsed.length ? '…' : ''}`;
}

export interface SanitisedName {
	name: string;
	changed: boolean;
	warnings: string[];
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// Characters Windows forbids, plus those that break Obsidian links or file names.
const FORBIDDEN_CHARS = /[\\/:*?"<>|#^[\]]/g;
const MAX_NAME_BYTES = 240;

/** Makes a note title safe as a file name (without extension) on every platform. */
export function sanitiseFileName(input: string): SanitisedName {
	const warnings: string[] = [];
	const cleaned = Array.from(nfc(input)).filter((ch) => ch.charCodeAt(0) >= 32).join('');
	let name = cleaned.replace(FORBIDDEN_CHARS, '-').replace(/\s+/g, ' ').trim();
	if (name !== cleaned.replace(/\s+/g, ' ').trim()) warnings.push('Some characters are not allowed in file names and were replaced.');
	const trimmed = name.replace(/[. ]+$/g, '').replace(/^\.+/, '');
	if (trimmed !== name) {
		warnings.push('Leading dots and trailing dots or spaces are not allowed and were removed.');
		name = trimmed;
	}
	if (WINDOWS_RESERVED.test(name)) {
		name = `${name}-`;
		warnings.push('The name is reserved on Windows, so a hyphen was added.');
	}
	const encoder = new TextEncoder();
	if (encoder.encode(name).length > MAX_NAME_BYTES) {
		let cut = '';
		for (const ch of name) {
			if (encoder.encode(cut + ch).length > MAX_NAME_BYTES) break;
			cut += ch;
		}
		name = cut.trim();
		warnings.push('The name was too long and was shortened.');
	}
	if (name === '') {
		name = 'Untitled';
		warnings.push('The name was empty, so "Untitled" is used.');
	}
	return { name, changed: warnings.length > 0, warnings };
}

/** Windows limits whole paths to about 260 characters. */
export function pathLengthWarning(fullPath: string): string | null {
	return fullPath.length > 240 ? 'The full path is long and may not sync to Windows.' : null;
}
