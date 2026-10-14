import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): { file: string; text: string }[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sources(path);
		return entry.name.endsWith('.ts') ? [{ file: path, text: readFileSync(path, 'utf8') }] : [];
	});
}

const files = sources('src');

describe('unload hygiene', () => {
	it('registers every Obsidian event through registerEvent so it is removed on unload', () => {
		const offenders: string[] = [];
		for (const { file, text } of files) {
			for (const match of text.matchAll(/\b(?:vault|metadataCache|workspace)\.on\(/g)) {
				const before = text.slice(Math.max(0, match.index - 80), match.index);
				if (!before.includes('registerEvent(')) offenders.push(`${file}: ${match[0]}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('adds no global listeners or intervals that nothing would remove', () => {
		const offenders: string[] = [];
		const patterns = [/\b(?:document|window|activeDocument|activeWindow)\.addEventListener\(/, /\bsetInterval\(/];
		for (const { file, text } of files) {
			for (const pattern of patterns) if (pattern.test(text)) offenders.push(`${file}: ${String(pattern)}`);
		}
		expect(offenders).toEqual([]);
	});

	it('keeps timers behind the scheduler so dispose can clear them', () => {
		const direct = files.filter(({ file, text }) => !file.endsWith('index-service.ts') && /\b(?:window\.)?setTimeout\(/.test(text));
		expect(direct.map((f) => f.file)).toEqual([]);
	});
});
