import { BROKEN_TYPE_LABELS, type BrokenLink, type BrokenType } from '../core/types';
import { basename, extensionOf, stripExtension } from '../core/text';
import type { IndexStatus } from '../adapters/index-service';
import type { PanelMode } from '../settings';

export interface PanelRow {
	link: BrokenLink;
	type: BrokenType;
	typeLabel: string;
	/** The link as written. */
	text: string;
	/** One-based, as shown to people. */
	line: number;
	sourcePath: string;
	sourceName: string;
}

export type PanelState =
	| { kind: 'scanning'; done: number; total: number }
	| { kind: 'no-note' }
	| { kind: 'unsupported'; name: string }
	| { kind: 'empty'; mode: PanelMode }
	| { kind: 'list'; rows: PanelRow[]; hidden: number };

export interface PanelInput {
	mode: PanelMode;
	currentPath: string | null;
	status: IndexStatus;
	brokenForCurrent: BrokenLink[];
	allBroken: BrokenLink[];
	/** Maximum rows to render at once; the rest are reported as `hidden`. */
	limit: number;
}

export function toRow(link: BrokenLink): PanelRow {
	return {
		link,
		type: link.type,
		typeLabel: BROKEN_TYPE_LABELS[link.type],
		text: link.original,
		line: link.start.line + 1,
		sourcePath: link.sourcePath,
		sourceName: stripExtension(basename(link.sourcePath)),
	};
}

export function computePanelState(input: PanelInput): PanelState {
	const { mode, currentPath, status } = input;
	if (status.state === 'scanning' || status.state === 'idle') {
		return { kind: 'scanning', done: status.done, total: status.total };
	}
	let source: BrokenLink[];
	if (mode === 'current') {
		if (currentPath === null) return { kind: 'no-note' };
		if (extensionOf(currentPath) !== 'md') return { kind: 'unsupported', name: basename(currentPath) };
		source = input.brokenForCurrent;
	} else {
		source = input.allBroken;
	}
	if (source.length === 0) return { kind: 'empty', mode };
	const rows = source.slice(0, input.limit).map(toRow);
	return { kind: 'list', rows, hidden: Math.max(0, source.length - rows.length) };
}
