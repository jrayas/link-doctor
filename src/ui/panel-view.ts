import { ItemView, setIcon, TFile, type WorkspaceLeaf } from 'obsidian';
import { jumpToLink } from '../adapters/navigate';
import { snippetAround } from '../core/text';
import type { PanelMode } from '../settings';
import { computePanelState, type PanelRow, type PanelState } from './panel-model';
import type LinkDoctorPlugin from '../main';

export const PANEL_VIEW_TYPE = 'link-doctor-panel';
const ROW_LIMIT = 100;

export class PanelView extends ItemView {
	private mode: PanelMode;
	private renderToken = 0;
	private listEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private modeButtons = new Map<PanelMode, HTMLButtonElement>();
	private limit = ROW_LIMIT;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: LinkDoctorPlugin) {
		super(leaf);
		this.mode = plugin.startingMode();
	}

	getViewType(): string {
		return PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Link doctor';
	}

	getIcon(): string {
		return 'stethoscope';
	}

	onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('link-doctor-panel');
		this.buildToolbar(root);
		this.statusEl = root.createDiv({ cls: 'link-doctor-status', attr: { role: 'status', 'aria-live': 'polite' } });
		this.listEl = root.createDiv({ cls: 'link-doctor-list' });
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.renderToken++;
		this.contentEl.empty();
		return Promise.resolve();
	}

	/** Called by the plugin when the index, the active note or the settings change. */
	refresh(): void {
		this.render();
	}

	private buildToolbar(root: HTMLElement): void {
		const bar = root.createDiv({ cls: 'link-doctor-toolbar' });
		const group = bar.createDiv({ cls: 'link-doctor-toggle', attr: { role: 'group', 'aria-label': 'Show broken links for' } });
		for (const [mode, label] of [['current', 'Current'], ['all', 'All']] as const) {
			const button = group.createEl('button', { text: label, cls: 'link-doctor-toggle-button' });
			button.addEventListener('click', () => this.setMode(mode));
			this.modeButtons.set(mode, button);
		}
		const refresh = bar.createEl('button', {
			cls: 'link-doctor-icon-button clickable-icon',
			attr: { 'aria-label': 'Rescan vault', title: 'Rescan vault' },
		});
		setIcon(refresh, 'refresh-cw');
		refresh.addEventListener('click', () => void this.plugin.rescan());
	}

	private setMode(mode: PanelMode): void {
		this.mode = mode;
		this.limit = ROW_LIMIT;
		this.plugin.rememberMode(mode);
		this.render();
	}

	private render(): void {
		if (!this.listEl || !this.statusEl) return;
		for (const [mode, button] of this.modeButtons) {
			const active = mode === this.mode;
			button.toggleClass('is-active', active);
			button.setAttribute('aria-pressed', String(active));
		}
		const service = this.plugin.service;
		const currentPath = this.plugin.currentPath;
		const state = computePanelState({
			mode: this.mode,
			currentPath,
			status: service.getStatus(),
			brokenForCurrent: currentPath ? service.brokenFor(currentPath) : [],
			allBroken: this.mode === 'all' ? service.allBroken() : [],
			limit: this.limit,
		});
		const token = ++this.renderToken;
		this.statusEl.empty();
		this.listEl.empty();
		this.renderState(state, token);
	}

	private renderState(state: PanelState, token: number): void {
		const list = this.listEl;
		const status = this.statusEl;
		if (!list || !status) return;
		switch (state.kind) {
			case 'scanning':
				status.setText(
					state.total > 0 ? `Scanning notes: ${state.done} of ${state.total}…` : 'Scanning notes…',
				);
				return;
			case 'no-note':
				this.message(list, 'No note open', 'Open a Markdown note to see its broken links, or switch to All.');
				return;
			case 'unsupported':
				this.message(list, 'Not a Markdown note', `${state.name} cannot contain wikilinks. Open a Markdown note to check it.`);
				return;
			case 'empty':
				this.message(
					list,
					'No broken links',
					state.mode === 'current' ? 'Every link in this note resolves. Nice work.' : 'Every link in your vault resolves. Nice work.',
				);
				return;
			case 'list': {
				const count = state.rows.length + state.hidden;
				status.setText(`${count} broken ${count === 1 ? 'link' : 'links'}`);
				const ul = list.createEl('ul', { cls: 'link-doctor-rows', attr: { role: 'list' } });
				for (const row of state.rows) this.renderRow(ul, row);
				if (state.hidden > 0) {
					const more = list.createEl('button', { text: `Show ${Math.min(state.hidden, ROW_LIMIT)} more`, cls: 'link-doctor-more' });
					more.addEventListener('click', () => {
						this.limit += ROW_LIMIT;
						this.render();
					});
				}
				void this.fillSnippets(state.rows, token);
			}
		}
	}

	private message(parent: HTMLElement, title: string, body: string): void {
		const box = parent.createDiv({ cls: 'link-doctor-empty' });
		box.createDiv({ cls: 'link-doctor-empty-title', text: title });
		box.createDiv({ cls: 'link-doctor-empty-body', text: body });
	}

	private renderRow(ul: HTMLElement, row: PanelRow): void {
		const li = ul.createEl('li', { cls: 'link-doctor-item' });
		const el = li.createDiv({
			cls: 'link-doctor-row',
			attr: {
				role: 'button',
				tabindex: '0',
				'aria-label': `${row.typeLabel}: ${row.text}, ${row.sourceName}, line ${row.line}. Go to link`,
				'data-row-id': row.link.id,
			},
		});
		const head = el.createDiv({ cls: 'link-doctor-row-head' });
		head.createSpan({ cls: 'link-doctor-badge', text: row.typeLabel });
		head.createSpan({ cls: 'link-doctor-line', text: `Line ${row.line}` });
		el.createDiv({ cls: 'link-doctor-link-text', text: row.text });
		if (this.mode === 'all') el.createDiv({ cls: 'link-doctor-source', text: row.sourcePath });
		el.createDiv({ cls: 'link-doctor-snippet', attr: { 'data-snippet-for': row.link.id } });
		const go = () => void jumpToLink(this.app, row.link);
		el.addEventListener('click', go);
		el.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				go();
			} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const rows = Array.from(ul.querySelectorAll<HTMLElement>('.link-doctor-row'));
				const next = rows[rows.indexOf(el) + (event.key === 'ArrowDown' ? 1 : -1)];
				next?.focus();
			}
		});
	}

	/** Reads each source note once, only for rows on screen, and adds a short context line. */
	private async fillSnippets(rows: PanelRow[], token: number): Promise<void> {
		const byPath = new Map<string, PanelRow[]>();
		for (const row of rows) byPath.set(row.sourcePath, [...(byPath.get(row.sourcePath) ?? []), row]);
		for (const [path, group] of byPath) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;
			let text: string;
			try {
				text = await this.app.vault.cachedRead(file);
			} catch {
				continue; // The file may be mid-sync; the row still works without a snippet.
			}
			if (token !== this.renderToken || !this.listEl) return;
			for (const row of group) {
				const target = this.listEl.querySelector<HTMLElement>(`[data-snippet-for="${CSS.escape(row.link.id)}"]`);
				const { start, end } = row.link;
				target?.setText(snippetAround(text, start.offset, end.offset - start.offset));
			}
		}
	}
}
