import { Modal, type App, type TFile } from 'obsidian';
import type { IndexService } from '../adapters/index-service';

/**
 * Developer aid: shows what Obsidian's metadata cache reports for a note next to what
 * Link Doctor detected, so the assumptions in docs/research-notes.md can be checked in
 * the real app. Read-only; nothing is written.
 */
export class DiagnosticsModal extends Modal {
	constructor(app: App, private readonly file: TFile, private readonly service: IndexService) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText('Link doctor diagnostics');
		contentEl.addClass('link-doctor-diagnostics');
		const cache = this.app.metadataCache.getFileCache(this.file);
		const fmt = (refs: NonNullable<typeof cache>['links']) =>
			(refs ?? []).map((r) => ({
				original: r.original,
				link: r.link,
				displayText: r.displayText,
				at: `${r.position.start.line + 1}:${r.position.start.col}`,
			}));
		const report = {
			path: this.file.path,
			cacheLinks: fmt(cache?.links),
			cacheEmbeds: fmt(cache?.embeds),
			cacheFrontmatterLinks: (cache?.frontmatterLinks ?? []).map((l) => ({ key: l.key, link: l.link })),
			headings: (cache?.headings ?? []).map((h) => `${'#'.repeat(h.level)} ${h.heading}`),
			blocks: Object.keys(cache?.blocks ?? {}),
			obsidianUnresolved: this.app.metadataCache.unresolvedLinks[this.file.path] ?? {},
			obsidianResolved: this.app.metadataCache.resolvedLinks[this.file.path] ?? {},
			linkDoctorBroken: this.service.brokenFor(this.file.path).map((b) => ({
				type: b.type,
				original: b.original,
				line: b.start.line + 1,
			})),
		};
		contentEl.createEl('pre', { text: JSON.stringify(report, null, 2), cls: 'link-doctor-diagnostics-text' });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
