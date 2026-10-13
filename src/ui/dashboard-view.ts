import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import { jumpToLink } from '../adapters/navigate';
import { BROKEN_TYPE_LABELS, BROKEN_TYPES, type BrokenLink, type BrokenType } from '../core/types';
import type { Suggestion } from '../core/suggest';
import { renderFixOptions } from './fix-options';
import { computeDashboard, defaultQuery, type DashboardModel } from './dashboard-model';
import type LinkDoctorPlugin from '../main';

export const DASHBOARD_VIEW_TYPE = 'link-doctor-dashboard';
const PAGE = 100;
const SLICE_MS = 8;
const CONFIDENCE = { high: 'High match', medium: 'Medium match', low: 'Low match' } as const;

interface PendingSuggestion {
	link: BrokenLink;
	cell: HTMLElement;
	apply: HTMLButtonElement;
}

export class DashboardView extends ItemView {
	private query = defaultQuery();
	private readonly suggestions = new Map<string, Suggestion | null>();
	private token = 0;
	private summaryEl!: HTMLElement;
	private resultsEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private folderEl!: HTMLSelectElement;
	private sortEl!: HTMLSelectElement;
	private groupEl!: HTMLButtonElement;
	private undoEl!: HTMLButtonElement;
	private readonly chipEls = new Map<BrokenType, HTMLButtonElement>();

	constructor(leaf: WorkspaceLeaf, private readonly plugin: LinkDoctorPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Link doctor dashboard';
	}

	getIcon(): string {
		return 'stethoscope';
	}

	onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('link-doctor-dashboard');
		this.buildHeader(root);
		this.summaryEl = root.createDiv({ cls: 'link-doctor-summary' });
		this.buildControls(root);
		this.statusEl = root.createDiv({ cls: 'link-doctor-status', attr: { role: 'status', 'aria-live': 'polite' } });
		this.resultsEl = root.createDiv({ cls: 'link-doctor-results' });
		this.refresh();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.token++;
		this.contentEl.empty();
		return Promise.resolve();
	}

	/** Called by the plugin when the index or settings change. Suggestions are recomputed lazily. */
	refresh(): void {
		this.suggestions.clear();
		this.render();
	}

	/** Enables the undo button only when there is something to undo. */
	updateUndo(): void {
		if (!this.undoEl) return;
		const label = this.plugin.fixes.undoLabel();
		this.undoEl.disabled = label === null;
		this.undoEl.setAttribute('aria-label', label ? `Undo: ${label}` : 'Undo last fix');
	}

	private buildHeader(root: HTMLElement): void {
		const header = root.createDiv({ cls: 'link-doctor-dashboard-header' });
		header.createEl('h2', { text: 'Link doctor', cls: 'link-doctor-dashboard-title' });
		const actions = header.createDiv({ cls: 'link-doctor-dashboard-actions' });
		const rescan = actions.createEl('button', { cls: 'link-doctor-icon-button clickable-icon', attr: { 'aria-label': 'Rescan vault', title: 'Rescan vault' } });
		setIcon(rescan, 'refresh-cw');
		rescan.addEventListener('click', () => void this.plugin.rescan());
		this.undoEl = actions.createEl('button', { cls: 'link-doctor-icon-button clickable-icon', attr: { 'aria-label': 'Undo last fix', title: 'Undo last fix' } });
		setIcon(this.undoEl, 'undo-2');
		this.undoEl.addEventListener('click', () => void this.plugin.fixes.undo());
		this.updateUndo();
	}

	private buildControls(root: HTMLElement): void {
		const controls = root.createDiv({ cls: 'link-doctor-controls' });
		this.searchEl = controls.createEl('input', {
			type: 'search',
			cls: 'link-doctor-search',
			attr: { placeholder: 'Search notes and links', 'aria-label': 'Search notes and broken links' },
		});
		this.searchEl.addEventListener('input', () => {
			this.query = { ...this.query, text: this.searchEl.value, limit: PAGE };
			this.render();
		});

		const chips = controls.createDiv({ cls: 'link-doctor-chips', attr: { role: 'group', 'aria-label': 'Filter by link type' } });
		for (const type of BROKEN_TYPES) {
			const chip = chips.createEl('button', { cls: 'link-doctor-chip', attr: { 'aria-pressed': 'false' } });
			chip.addEventListener('click', () => {
				const types = new Set(this.query.types);
				if (!types.delete(type)) types.add(type);
				this.query = { ...this.query, types, limit: PAGE };
				this.render();
			});
			this.chipEls.set(type, chip);
		}

		const row = controls.createDiv({ cls: 'link-doctor-select-row' });
		this.folderEl = this.select(row, 'Folder', (value) => (this.query = { ...this.query, folder: value, limit: PAGE }));
		this.sortEl = this.select(row, 'Sort by', (value) => (this.query = { ...this.query, sort: value === 'name' ? 'name' : 'count' }));
		this.sortEl.createEl('option', { value: 'count', text: 'Most broken links' });
		this.sortEl.createEl('option', { value: 'name', text: 'Note name' });
		this.groupEl = row.createEl('button', { cls: 'link-doctor-group-toggle', attr: { 'aria-pressed': 'true' } });
		this.groupEl.addEventListener('click', () => {
			this.query = { ...this.query, groupByNote: !this.query.groupByNote };
			this.render();
		});
	}

	private select(parent: HTMLElement, label: string, onChange: (value: string) => void): HTMLSelectElement {
		const wrap = parent.createEl('label', { cls: 'link-doctor-select' });
		wrap.createSpan({ text: label, cls: 'link-doctor-select-label' });
		const el = wrap.createEl('select', { cls: 'dropdown' });
		el.addEventListener('change', () => {
			onChange(el.value);
			this.render();
		});
		return el;
	}

	private render(): void {
		if (!this.resultsEl) return;
		const token = ++this.token;
		const service = this.plugin.service;
		const status = service.getStatus();
		this.resultsEl.empty();
		this.statusEl.empty();
		this.updateUndo();
		if (status.state !== 'ready') {
			this.summaryEl.empty();
			this.statusEl.setText(status.total > 0 ? `Scanning notes: ${status.done} of ${status.total}…` : 'Scanning notes…');
			return;
		}
		const model = computeDashboard({
			broken: service.allBroken(),
			noteCount: service.noteCount(),
			linkCount: service.linkCount(),
			query: this.query,
		});
		this.renderSummary(model);
		this.syncControls(model);
		if (model.summary.brokenCount === 0) {
			this.message('No broken links', 'Every link in your vault resolves. Nice work.');
			return;
		}
		if (model.matching === 0) {
			this.message('Nothing matches', 'Try a different search or clear the filters.', true);
			return;
		}
		this.statusEl.setText(`Showing ${model.matching - model.hidden} of ${model.matching} matching broken ${model.matching === 1 ? 'link' : 'links'}`);
		const pending: PendingSuggestion[] = [];
		for (const group of model.groups) {
			const grouped = this.query.groupByNote;
			const holder = this.resultsEl.createDiv({ cls: 'link-doctor-group' });
			if (grouped) {
				const head = holder.createDiv({ cls: 'link-doctor-group-head', attr: { role: 'heading', 'aria-level': '3' } });
				head.createSpan({ cls: 'link-doctor-group-path', text: group.sourcePath });
				const total = service.brokenFor(group.sourcePath).length;
				head.createSpan({ cls: 'link-doctor-group-count', text: `${total} broken` });
			}
			this.renderTable(holder, group.links, !grouped, pending);
		}
		if (model.hidden > 0) {
			const more = this.resultsEl.createEl('button', { text: `Show ${Math.min(model.hidden, PAGE)} more`, cls: 'link-doctor-more' });
			more.addEventListener('click', () => {
				this.query = { ...this.query, limit: this.query.limit + PAGE };
				this.render();
			});
		}
		void this.fillSuggestions(pending, token);
	}

	private renderSummary(model: DashboardModel): void {
		const { summary } = model;
		this.summaryEl.empty();
		const tiles = this.summaryEl.createDiv({ cls: 'link-doctor-tiles' });
		const tile = (label: string, value: string) => {
			const t = tiles.createDiv({ cls: 'link-doctor-tile' });
			t.createDiv({ cls: 'link-doctor-tile-value', text: value });
			t.createDiv({ cls: 'link-doctor-tile-label', text: label });
		};
		tile('Notes', summary.totalNotes.toLocaleString());
		tile('Links', summary.totalLinks.toLocaleString());
		tile('Broken', summary.brokenCount.toLocaleString());
		tile('Healthy', `${summary.healthyPercent}%`);
		const bar = this.summaryEl.createDiv({
			cls: 'link-doctor-health-bar',
			attr: { role: 'img', 'aria-label': `${summary.healthyPercent} per cent of links are healthy` },
		});
		bar.createDiv({ cls: 'link-doctor-health-fill' }).setCssProps({ '--ld-health': `${summary.healthyPercent}%` });

		if (model.worstOffenders.length > 0) {
			const worst = this.summaryEl.createDiv({ cls: 'link-doctor-worst' });
			worst.createDiv({ cls: 'link-doctor-worst-title', text: 'Notes with the most broken links' });
			for (const g of model.worstOffenders) {
				const b = worst.createEl('button', { cls: 'link-doctor-worst-item', attr: { 'aria-label': `Show ${g.sourcePath}, ${g.links.length} broken` } });
				b.createSpan({ cls: 'link-doctor-worst-path', text: g.sourcePath });
				b.createSpan({ cls: 'link-doctor-group-count', text: String(g.links.length) });
				b.addEventListener('click', () => {
					this.searchEl.value = g.sourcePath;
					this.query = { ...this.query, text: g.sourcePath, limit: PAGE };
					this.render();
				});
			}
		}
	}

	/** Keeps the controls in step with the data without rebuilding them (so typing keeps its focus). */
	private syncControls(model: DashboardModel): void {
		for (const [type, chip] of this.chipEls) {
			const on = this.query.types.has(type);
			chip.setText(`${BROKEN_TYPE_LABELS[type]} ${model.summary.byType[type]}`);
			chip.setAttribute('aria-pressed', String(on));
			chip.toggleClass('is-active', on);
		}
		const folders = ['', ...model.folders];
		if (this.query.folder !== '' && !folders.includes(this.query.folder)) folders.push(this.query.folder);
		this.folderEl.empty();
		for (const f of folders) this.folderEl.createEl('option', { value: f, text: f === '' ? 'All folders' : f });
		this.folderEl.value = this.query.folder;
		this.sortEl.value = this.query.sort;
		this.groupEl.setText(this.query.groupByNote ? 'Grouped by note' : 'Flat list');
		this.groupEl.setAttribute('aria-pressed', String(this.query.groupByNote));
	}

	private message(title: string, body: string, clearable = false): void {
		const box = this.resultsEl.createDiv({ cls: 'link-doctor-empty' });
		box.createDiv({ cls: 'link-doctor-empty-title', text: title });
		box.createDiv({ cls: 'link-doctor-empty-body', text: body });
		if (clearable) {
			const clear = box.createEl('button', { text: 'Clear filters' });
			clear.addEventListener('click', () => {
				this.query = { ...defaultQuery(), sort: this.query.sort, groupByNote: this.query.groupByNote };
				this.searchEl.value = '';
				this.render();
			});
		}
	}

	/** A real table on wide panes; styles.css turns each row into a card on narrow ones. */
	private renderTable(parent: HTMLElement, links: BrokenLink[], showNote: boolean, pending: PendingSuggestion[]): void {
		const table = parent.createEl('table', { cls: 'link-doctor-table' });
		const headRow = table.createEl('thead').createEl('tr');
		const columns = [...(showNote ? ['Note'] : []), 'Link', 'Type', 'Line', 'Suggested fix', 'Actions'];
		for (const c of columns) headRow.createEl('th', { text: c, attr: { scope: 'col' } });
		const body = table.createEl('tbody');
		for (const link of links) this.renderRow(body, link, showNote, columns.length, pending);
	}

	private renderRow(body: HTMLElement, link: BrokenLink, showNote: boolean, colSpan: number, pending: PendingSuggestion[]): void {
		const tr = body.createEl('tr', { cls: 'link-doctor-table-row' });
		const cell = (label: string, cls?: string) => tr.createEl('td', { attr: { 'data-label': label }, ...(cls ? { cls } : {}) });
		if (showNote) cell('Note', 'link-doctor-cell-note').setText(link.sourcePath);
		cell('Link', 'link-doctor-cell-link').createEl('code', { text: link.original });
		cell('Type').createSpan({ cls: 'link-doctor-badge', text: BROKEN_TYPE_LABELS[link.type] });
		cell('Line').setText(String(link.start.line + 1));
		const suggestionCell = cell('Suggested fix', 'link-doctor-cell-suggestion');
		const actions = cell('Actions', 'link-doctor-cell-actions');

		const apply = actions.createEl('button', { text: 'Apply suggestion', cls: 'mod-cta', attr: { disabled: 'true' } });
		const more = actions.createEl('button', { text: 'More fixes', attr: { 'aria-expanded': 'false' } });
		const go = actions.createEl('button', { text: 'Go to link' });
		go.addEventListener('click', () => void jumpToLink(this.app, link, true));

		let detail: HTMLElement | null = null;
		more.addEventListener('click', () => {
			if (detail) {
				detail.remove();
				detail = null;
				more.setAttribute('aria-expanded', 'false');
				return;
			}
			const row = createEl('tr', { cls: 'link-doctor-detail-row' });
			const td = row.createEl('td', { attr: { colspan: String(colSpan) } });
			renderFixOptions(td.createDiv({ cls: 'link-doctor-fix-options' }), link, this.plugin.fixes);
			tr.after(row);
			detail = row;
			more.setAttribute('aria-expanded', 'true');
		});
		pending.push({ link, cell: suggestionCell, apply });
	}

	/** Works out the best suggestion for each visible row in short slices, so the pane never freezes. */
	private async fillSuggestions(pending: PendingSuggestion[], token: number): Promise<void> {
		let sliceStart = performance.now();
		for (const item of pending) {
			if (token !== this.token) return;
			let suggestion = this.suggestions.get(item.link.id);
			if (suggestion === undefined) {
				suggestion = this.plugin.fixes.suggestions(item.link, 1)[0] ?? null;
				this.suggestions.set(item.link.id, suggestion);
			}
			this.showSuggestion(item, suggestion);
			if (performance.now() - sliceStart > SLICE_MS) {
				await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
				sliceStart = performance.now();
			}
		}
	}

	private showSuggestion(item: PendingSuggestion, suggestion: Suggestion | null): void {
		item.cell.empty();
		if (!suggestion) {
			item.cell.createSpan({ cls: 'link-doctor-no-suggestion', text: 'No close match' });
			return;
		}
		item.cell.createSpan({ text: suggestion.label });
		item.cell.createSpan({ cls: `link-doctor-confidence is-${suggestion.confidence}`, text: CONFIDENCE[suggestion.confidence] });
		item.apply.disabled = false;
		item.apply.removeAttribute('disabled');
		item.apply.setAttribute('aria-label', `Apply suggestion: use ${suggestion.label}`);
		item.apply.addEventListener('click', () => void this.plugin.fixes.run(item.link, { kind: 'apply', suggestion }));
	}
}
