import {
	filterBroken,
	foldersOf,
	groupByNote,
	sortGroups,
	summarise,
	type HealthSummary,
	type NoteGroup,
	type SortKey,
} from '../core/stats';
import type { BrokenLink, BrokenType } from '../core/types';

export interface DashboardQuery {
	text: string;
	types: ReadonlySet<BrokenType>;
	folder: string;
	sort: SortKey;
	groupByNote: boolean;
	/** Most links to render at once; the rest are counted as `hidden`. */
	limit: number;
}

export interface DashboardInput {
	broken: readonly BrokenLink[];
	noteCount: number;
	linkCount: number;
	query: DashboardQuery;
}

export interface DashboardModel {
	/** Always the whole vault, so the health figures do not change while filtering. */
	summary: HealthSummary;
	worstOffenders: NoteGroup[];
	folders: string[];
	/** Links matching the filters, before the render limit. */
	matching: number;
	/** Groups when grouping by note, otherwise a single group with an empty path. */
	groups: NoteGroup[];
	hidden: number;
	filtersActive: boolean;
}

export function defaultQuery(): DashboardQuery {
	return { text: '', types: new Set(), folder: '', sort: 'count', groupByNote: true, limit: 100 };
}

export function hasActiveFilters(q: DashboardQuery): boolean {
	return q.text.trim() !== '' || q.types.size > 0 || q.folder !== '';
}

export function computeDashboard(input: DashboardInput): DashboardModel {
	const { broken, query } = input;
	const filtered = filterBroken(broken, { text: query.text, types: query.types, folder: query.folder });
	const sorted = sortGroups(groupByNote(filtered), query.sort);
	const flat = sorted.flatMap((g) => g.links);
	let remaining = query.limit;
	let groups: NoteGroup[];
	if (query.groupByNote) {
		groups = [];
		for (const g of sorted) {
			if (remaining <= 0) break;
			const links = g.links.slice(0, remaining);
			remaining -= links.length;
			groups.push({ sourcePath: g.sourcePath, links });
		}
	} else {
		groups = flat.length === 0 ? [] : [{ sourcePath: '', links: flat.slice(0, query.limit) }];
	}
	const shown = groups.reduce((n, g) => n + g.links.length, 0);
	return {
		summary: summarise(broken, input.noteCount, input.linkCount),
		worstOffenders: groupByNote(broken).slice(0, 5),
		folders: foldersOf(broken),
		matching: flat.length,
		groups,
		hidden: flat.length - shown,
		filtersActive: hasActiveFilters(query),
	};
}
