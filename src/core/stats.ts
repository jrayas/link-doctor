import { foldName } from './text';
import type { BrokenLink, BrokenType } from './types';
import { BROKEN_TYPES } from './types';

export interface HealthSummary {
	totalNotes: number;
	totalLinks: number;
	brokenCount: number;
	/** 0 to 100, one decimal place. 100 when there are no links. */
	healthyPercent: number;
	byType: Record<BrokenType, number>;
}

export function summarise(broken: readonly BrokenLink[], totalNotes: number, totalLinks: number): HealthSummary {
	const byType = Object.fromEntries(BROKEN_TYPES.map((t) => [t, 0])) as Record<BrokenType, number>;
	for (const b of broken) byType[b.type]++;
	const healthy = totalLinks === 0 ? 100 : Math.max(0, ((totalLinks - broken.length) / totalLinks) * 100);
	return {
		totalNotes,
		totalLinks,
		brokenCount: broken.length,
		healthyPercent: Math.round(healthy * 10) / 10,
		byType,
	};
}

export interface NoteGroup {
	sourcePath: string;
	links: BrokenLink[];
}

/** Groups by source note, worst offenders first (ties by path). */
export function groupByNote(broken: readonly BrokenLink[]): NoteGroup[] {
	const map = new Map<string, BrokenLink[]>();
	for (const b of broken) {
		const list = map.get(b.sourcePath);
		if (list) list.push(b);
		else map.set(b.sourcePath, [b]);
	}
	return [...map.entries()]
		.map(([sourcePath, links]) => ({ sourcePath, links }))
		.sort((a, b) => b.links.length - a.links.length || (a.sourcePath < b.sourcePath ? -1 : 1));
}

export interface BrokenFilter {
	text?: string;
	types?: ReadonlySet<BrokenType>;
	/** Folder path prefix, for example `Projects/2026`. Empty means the whole vault. */
	folder?: string;
}

export function filterBroken(broken: readonly BrokenLink[], filter: BrokenFilter): BrokenLink[] {
	const needle = foldName((filter.text ?? '').trim());
	const folder = foldName((filter.folder ?? '').replace(/^\/+|\/+$/g, ''));
	return broken.filter((b) => {
		if (filter.types && filter.types.size > 0 && !filter.types.has(b.type)) return false;
		if (folder !== '') {
			const p = foldName(b.sourcePath);
			if (!p.startsWith(`${folder}/`)) return false;
		}
		if (needle === '') return true;
		return foldName(`${b.sourcePath} ${b.original} ${b.target}${b.subpath}`).includes(needle);
	});
}

export type SortKey = 'count' | 'name';

export function sortGroups(groups: readonly NoteGroup[], key: SortKey): NoteGroup[] {
	const copy = [...groups];
	if (key === 'name') return copy.sort((a, b) => (foldName(a.sourcePath) < foldName(b.sourcePath) ? -1 : 1));
	return copy.sort((a, b) => b.links.length - a.links.length || (a.sourcePath < b.sourcePath ? -1 : 1));
}

/** Distinct folders that contain notes with broken links, for the folder filter. */
export function foldersOf(broken: readonly BrokenLink[]): string[] {
	const set = new Set<string>();
	for (const b of broken) {
		const parts = b.sourcePath.split('/').slice(0, -1);
		for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
	}
	return [...set].sort();
}
