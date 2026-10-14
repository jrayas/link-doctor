/** The five kinds of broken link the plugin reports. */
export type BrokenType =
	| 'missing-note'
	| 'missing-heading'
	| 'missing-block'
	| 'missing-embed'
	| 'missing-markdown-target';

export const BROKEN_TYPES: readonly BrokenType[] = [
	'missing-note',
	'missing-heading',
	'missing-block',
	'missing-embed',
	'missing-markdown-target',
];

export type LinkSyntax = 'wikilink' | 'markdown';

/** A zero-based position, matching the metadata cache. `offset` counts UTF-16 code units. */
export interface SourcePos {
	line: number;
	col: number;
	offset: number;
}

/** A link or embed as the metadata cache reports it (links and embeds merged). */
export interface CachedLink {
	/** The text exactly as written, for example `![[Note#Heading|alias]]`. */
	original: string;
	/** The link destination, for example `Note#Heading`. */
	link: string;
	displayText?: string;
	start: SourcePos;
	end: SourcePos;
}

export interface HeadingInfo {
	heading: string;
	level: number;
}

/** Plain-data view of one file, independent of the Obsidian API. */
export interface NoteSnapshot {
	path: string;
	aliases: string[];
	links: CachedLink[];
	headings: HeadingInfo[];
	/** Block ids without the leading `^`. */
	blocks: string[];
}

export interface BrokenLink {
	/** Stable within one scan: `path:line:col`. */
	id: string;
	sourcePath: string;
	type: BrokenType;
	syntax: LinkSyntax;
	embed: boolean;
	original: string;
	/** Decoded path part of the destination (may be empty for same-note links). */
	target: string;
	/** Heading or block part including its leading `#` or `#^`, or an empty string. */
	subpath: string;
	displayText?: string;
	/** Path of the existing file the link points into, for heading and block problems. */
	resolvedPath?: string;
	start: SourcePos;
	end: SourcePos;
}

export const BROKEN_TYPE_LABELS: Record<BrokenType, string> = {
	'missing-note': 'Missing note',
	'missing-heading': 'Missing heading',
	'missing-block': 'Missing block',
	'missing-embed': 'Missing embed',
	'missing-markdown-target': 'Missing Markdown link target',
};

/** Compact labels for tight columns; the full label goes in the tooltip. */
export const BROKEN_TYPE_SHORT_LABELS: Record<BrokenType, string> = {
	'missing-note': 'Missing note',
	'missing-heading': 'Missing heading',
	'missing-block': 'Missing block',
	'missing-embed': 'Missing embed',
	'missing-markdown-target': 'Missing target',
};
