import { describe, expect, it } from 'vitest';
import { resolveRelative, splitLinktext, stripHeading, subpathExists } from '../../src/core/resolve';
import { note, vault } from '../helpers/build';

describe('splitLinktext', () => {
	it('splits at the first #', () => {
		expect(splitLinktext('Note')).toEqual({ path: 'Note', subpath: '' });
		expect(splitLinktext('Note#Head')).toEqual({ path: 'Note', subpath: '#Head' });
		expect(splitLinktext('Note#A#B')).toEqual({ path: 'Note', subpath: '#A#B' });
		expect(splitLinktext('#^id')).toEqual({ path: '', subpath: '#^id' });
	});
});

describe('stripHeading', () => {
	it('matches Obsidian-style normalisation', () => {
		expect(stripHeading('What\'s new? (v1.2)')).toBe(stripHeading("What's new v1.2"));
		expect(stripHeading('foo!"#$%&()*+,.:;<=>?@^`{|}~/[]\\bar')).toBe('foo bar');
		expect(stripHeading('  Mixed   CASE ')).toBe('mixed case');
	});
});

describe('resolveRelative', () => {
	it('collapses dot segments', () => {
		expect(resolveRelative('./b', 'a')).toBe('a/b');
		expect(resolveRelative('../b', 'a/c')).toBe('a/b');
		expect(resolveRelative('../../x', 'a')).toBeNull();
	});
});

describe('VaultIndex.resolve', () => {
	const index = vault(
		[
			note('Home.md'),
			note('Projects/Alpha/Plan.md'),
			note('Projects/Beta/Plan.md'),
			note('Folder with spaces/Spaced note.md'),
			note('Café.md'),
			note('日本語ノート.md'),
			note('🙂 Emoji note.md'),
			note('שלום.md'),
		],
		['images/photo.png', 'Docs/Report.pdf'],
	);

	it('resolves by bare name, with and without extension', () => {
		expect(index.resolve('Home', 'x.md')).toBe('Home.md');
		expect(index.resolve('Home.md', 'x.md')).toBe('Home.md');
		expect(index.resolve('photo.png', 'x.md')).toBe('images/photo.png');
		expect(index.resolve('Report.pdf', 'x.md')).toBe('Docs/Report.pdf');
	});

	it('ignores case', () => {
		expect(index.resolve('hOmE', 'x.md')).toBe('Home.md');
		expect(index.resolve('PHOTO.PNG', 'x.md')).toBe('images/photo.png');
	});

	it('ignores Unicode normalisation form in both directions', () => {
		expect(index.resolve('Café', 'x.md')).toBe('Café.md');
		const nfdVault = vault([note('Café.md')]);
		expect(nfdVault.resolve('Café', 'x.md')).toBe('Café.md');
	});

	it('resolves CJK, emoji and right-to-left names', () => {
		expect(index.resolve('日本語ノート', 'x.md')).toBe('日本語ノート.md');
		expect(index.resolve('🙂 Emoji note', 'x.md')).toBe('🙂 Emoji note.md');
		expect(index.resolve('שלום', 'x.md')).toBe('שלום.md');
	});

	it('resolves folders with spaces and partial paths', () => {
		expect(index.resolve('Folder with spaces/Spaced note', 'x.md')).toBe('Folder with spaces/Spaced note.md');
		expect(index.resolve('Alpha/Plan', 'x.md')).toBe('Projects/Alpha/Plan.md');
	});

	it('accepts backslashes in input', () => {
		expect(index.resolve('Folder with spaces\\Spaced note', 'x.md')).toBe('Folder with spaces/Spaced note.md');
	});

	it('prefers the candidate closest to the source note', () => {
		expect(index.resolve('Plan', 'Projects/Beta/Notes.md')).toBe('Projects/Beta/Plan.md');
		expect(index.resolve('Plan', 'Projects/Alpha/Notes.md')).toBe('Projects/Alpha/Plan.md');
	});

	it('resolves explicit relative paths against the source folder', () => {
		expect(index.resolve('./Spaced note', 'Folder with spaces/R.md')).toBe('Folder with spaces/Spaced note.md');
		expect(index.resolve('../Home', 'Folder with spaces/R.md')).toBe('Home.md');
		expect(index.resolve('../Nothing', 'Folder with spaces/R.md')).toBeNull();
		expect(index.resolve('../../Home', 'Folder with spaces/R.md')).toBeNull();
	});

	it('returns null for missing files and treats an empty path as the source', () => {
		expect(index.resolve('Nope', 'x.md')).toBeNull();
		expect(index.resolve('', 'Home.md')).toBe('Home.md');
	});

	it('stops resolving a file once removed', () => {
		const v = vault([note('A.md'), note('B/A.md')]);
		v.removeFile('A.md');
		expect(v.resolve('A', 'x.md')).toBe('B/A.md');
		v.removeFile('B/A.md');
		expect(v.resolve('A', 'x.md')).toBeNull();
	});
});

describe('subpathExists', () => {
	const target = note('T.md', {
		headings: [
			{ heading: 'Title', level: 1 },
			{ heading: 'One', level: 2 },
			{ heading: 'Deep', level: 3 },
			{ heading: 'Two', level: 2 },
			{ heading: 'Repeat', level: 2 },
			{ heading: 'Repeat', level: 2 },
			{ heading: "What's new? (v1.2)", level: 2 },
		],
		blocks: ['block-a', 'Block-B'],
	});

	it('matches headings case-insensitively', () => {
		expect(subpathExists('#one', target)).toBe(true);
		expect(subpathExists('#Nope', target)).toBe(false);
	});

	it('handles duplicate headings and special characters', () => {
		expect(subpathExists('#Repeat', target)).toBe(true);
		expect(subpathExists("#What's new v1.2", target)).toBe(true);
	});

	it('requires nested headings to sit under their parent', () => {
		expect(subpathExists('#One#Deep', target)).toBe(true);
		expect(subpathExists('#Two#Deep', target)).toBe(false);
		expect(subpathExists('#Title#One#Deep', target)).toBe(true);
	});

	it('matches block ids case-insensitively', () => {
		expect(subpathExists('#^block-a', target)).toBe(true);
		expect(subpathExists('#^block-b', target)).toBe(true);
		expect(subpathExists('#^block-c', target)).toBe(false);
	});

	it('treats an empty subpath as present', () => {
		expect(subpathExists('', target)).toBe(true);
		expect(subpathExists('#', target)).toBe(true);
	});
});
