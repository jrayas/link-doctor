import { TFile, type App, type CachedMetadata, type Plugin } from 'obsidian';
import type { CachedLink, NoteSnapshot } from '../core/types';
import type { IndexService, VaultPort } from './index-service';

type CacheReference = NonNullable<CachedMetadata['links']>[number];

function toCachedLink(ref: CacheReference): CachedLink {
	return {
		original: ref.original,
		link: ref.link,
		...(ref.displayText !== undefined ? { displayText: ref.displayText } : {}),
		start: { line: ref.position.start.line, col: ref.position.start.col, offset: ref.position.start.offset },
		end: { line: ref.position.end.line, col: ref.position.end.col, offset: ref.position.end.offset },
	};
}

function readAliases(cache: CachedMetadata): string[] {
	const raw: unknown = cache.frontmatter?.aliases ?? cache.frontmatter?.alias;
	if (typeof raw === 'string') return raw.split(',').map((a) => a.trim()).filter((a) => a !== '');
	if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim());
	return [];
}

/** Converts Obsidian's cached metadata into the plain snapshot the core works on. */
export function toSnapshot(path: string, cache: CachedMetadata): NoteSnapshot {
	const byOffset = new Map<number, CachedLink>();
	for (const ref of [...(cache.links ?? []), ...(cache.embeds ?? [])]) {
		byOffset.set(ref.position.start.offset, toCachedLink(ref));
	}
	return {
		path,
		aliases: readAliases(cache),
		links: [...byOffset.values()].sort((a, b) => a.start.offset - b.start.offset),
		headings: (cache.headings ?? []).map((h) => ({ heading: h.heading, level: h.level })),
		blocks: Object.keys(cache.blocks ?? {}),
		// Obsidian lists frontmatter as a 'yaml' section; a blank body (spaces, newlines) has no sections at all.
		empty: (cache.sections ?? []).every((section) => section.type === 'yaml'),
	};
}

export function createVaultPort(app: App): VaultPort {
	return {
		listFiles: () => app.vault.getFiles().map((f) => f.path),
		readSnapshot: (path) => {
			const file = app.vault.getFileByPath(path);
			const cache = file ? app.metadataCache.getFileCache(file) : null;
			return cache ? toSnapshot(path, cache) : null;
		},
	};
}

/**
 * Hooks Obsidian's events up to the index service. Everything goes through `registerEvent`,
 * so it is removed when the plugin unloads. Registration happens once the layout is ready,
 * which avoids the flood of `create` events while the vault loads.
 */
export function wireVaultEvents(plugin: Plugin, service: IndexService, isAutoRefresh: () => boolean): void {
	const { app } = plugin;
	plugin.registerEvent(
		app.metadataCache.on('changed', (file) => {
			if (!isAutoRefresh() || file.extension !== 'md') return;
			const cache = app.metadataCache.getFileCache(file);
			if (cache) service.upsertNote(toSnapshot(file.path, cache));
		}),
	);
	plugin.registerEvent(
		app.metadataCache.on('deleted', (file) => {
			if (isAutoRefresh()) service.removeFile(file.path);
		}),
	);
	plugin.registerEvent(
		app.vault.on('create', (file) => {
			if (isAutoRefresh() && file instanceof TFile) service.addFile(file.path);
		}),
	);
	plugin.registerEvent(
		app.vault.on('delete', (file) => {
			if (isAutoRefresh() && file instanceof TFile) service.removeFile(file.path);
		}),
	);
	plugin.registerEvent(
		app.vault.on('rename', (file, oldPath) => {
			if (isAutoRefresh() && file instanceof TFile) service.renameFile(oldPath, file.path);
		}),
	);
}
