import type { VaultIndex } from './resolve';
import { splitLinktext } from './resolve';
import { basename, extensionOf, stripExtension } from './text';

export interface ParsedWikilink {
	kind: 'wikilink';
	embed: boolean;
	path: string;
	subpath: string;
	alias: string | undefined;
	/** The alias separator was written `\|` (needed inside Markdown tables). */
	escapedPipe: boolean;
}

export interface ParsedMarkdownLink {
	kind: 'markdown';
	embed: boolean;
	text: string;
	dest: string;
	angle: boolean;
	/** Optional title including its quotes and the space before it. */
	title: string;
}

const WIKILINK = /^(!?)\[\[([\s\S]*)\]\]$/;
const MARKDOWN = /^(!?)\[((?:[^\]\\]|\\[\s\S])*)\]\((<[^>]*>|[^\s)]*)(\s+(?:"[^"]*"|'[^']*'))?\s*\)$/;

export function parseLinkText(original: string): ParsedWikilink | ParsedMarkdownLink | null {
	const wiki = WIKILINK.exec(original);
	if (wiki) {
		const inner = wiki[2] ?? '';
		const pipe = /(\\?)\|/.exec(inner);
		const linktext = pipe ? inner.slice(0, pipe.index) : inner;
		const alias = pipe ? inner.slice(pipe.index + pipe[0].length) : undefined;
		const { path, subpath } = splitLinktext(linktext);
		return { kind: 'wikilink', embed: wiki[1] === '!', path, subpath, alias, escapedPipe: pipe?.[1] === '\\' };
	}
	const md = MARKDOWN.exec(original);
	if (md) {
		const rawDest = md[3] ?? '';
		const angle = rawDest.startsWith('<');
		return {
			kind: 'markdown',
			embed: md[1] === '!',
			text: md[2] ?? '',
			dest: angle ? rawDest.slice(1, -1) : rawDest,
			angle,
			title: md[4] ?? '',
		};
	}
	return null;
}

export interface LinkChange {
	/** New link path. Omit to keep the current one. */
	path?: string;
	/** New subpath including its leading `#`. Use an empty string to drop it. Omit to keep it. */
	subpath?: string;
}

/** Rewrites one link, keeping its alias, embed marker, style, escaping and title. */
export function retarget(original: string, change: LinkChange): string | null {
	const parsed = parseLinkText(original);
	if (!parsed) return null;
	if (parsed.kind === 'wikilink') {
		const target = (change.path ?? parsed.path) + (change.subpath ?? parsed.subpath);
		const alias = parsed.alias === undefined ? '' : `${parsed.escapedPipe ? '\\|' : '|'}${parsed.alias}`;
		return `${parsed.embed ? '!' : ''}[[${target}${alias}]]`;
	}
	const { path, subpath } = splitLinktext(safeDecode(parsed.dest));
	const newPath = change.path ?? path;
	const newSub = change.subpath ?? subpath;
	const wasEncoded = /%[0-9a-f]{2}/i.test(parsed.dest);
	let dest = newPath + newSub;
	if (!parsed.angle && (wasEncoded || /[\s()]/.test(dest))) dest = encodeDestination(newPath) + encodeSub(newSub);
	if (parsed.angle) dest = `<${dest}>`;
	return `${parsed.embed ? '!' : ''}[${parsed.text}](${dest}${parsed.title})`;
}

/** Removes the link syntax but keeps readable text. */
export function removeLinkKeepText(original: string): string | null {
	const parsed = parseLinkText(original);
	if (!parsed) return null;
	if (parsed.kind === 'markdown') {
		return parsed.text !== '' ? parsed.text : basename(safeDecode(parsed.dest));
	}
	if (parsed.alias !== undefined && parsed.alias !== '') return parsed.alias;
	const heading = parsed.subpath.startsWith('#^') ? '' : parsed.subpath.replace(/^#/, '').replace(/#/g, ' > ');
	const name = parsed.path === '' ? '' : basename(parsed.path);
	if (name !== '' && heading !== '') return `${name} > ${heading}`;
	return name !== '' ? name : heading;
}

/**
 * The text to put in a link to `targetPath`: the bare name if that resolves to the same file,
 * otherwise the vault path. Notes drop `.md` in wikilinks; Markdown links keep the full path.
 */
export function linkPathFor(
	targetPath: string,
	sourcePath: string,
	index: VaultIndex,
	syntax: 'wikilink' | 'markdown',
	preferFullPath = false,
): string {
	const isNote = extensionOf(targetPath) === 'md';
	if (syntax === 'markdown') return targetPath;
	const withoutExt = isNote ? stripExtension(targetPath) : targetPath;
	if (preferFullPath) return withoutExt;
	const short = isNote ? stripExtension(basename(targetPath)) : basename(targetPath);
	return index.resolve(short, sourcePath) === targetPath ? short : withoutExt;
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function encodeDestination(path: string): string {
	return path
		.split('/')
		.map((seg) => encodeURIComponent(seg).replace(/\(/g, '%28').replace(/\)/g, '%29'))
		.join('/');
}

function encodeSub(subpath: string): string {
	return subpath === '' ? '' : `#${encodeURIComponent(subpath.slice(1)).replace(/%5E/gi, '^')}`;
}
