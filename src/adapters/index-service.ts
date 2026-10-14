import { detectNote, type DetectOptions } from '../core/detect';
import { findEmptyNotes } from '../core/checks/empty-notes';
import { VaultIndex } from '../core/resolve';
import { extensionOf } from '../core/text';
import type { BrokenLink, NoteSnapshot } from '../core/types';

/** What the service needs from the host; the Obsidian implementation lives in `obsidian-port.ts`. */
export interface VaultPort {
	/** Every file in the vault, notes and attachments. */
	listFiles(): string[];
	/** The parsed note, or null if the metadata cache has not indexed it yet. */
	readSnapshot(path: string): NoteSnapshot | null;
}

export interface Scheduler {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
	now(): number;
}

export const defaultScheduler: Scheduler = {
	setTimeout: (fn, ms) => window.setTimeout(fn, ms),
	clearTimeout: (handle) => window.clearTimeout(handle as number),
	now: () => performance.now(),
};

export type IndexState = 'idle' | 'scanning' | 'ready';

export interface IndexStatus {
	state: IndexState;
	done: number;
	total: number;
}

export type IndexEvent = { kind: 'status' } | { kind: 'updated'; paths: string[] | 'all' };

const SLICE_BUDGET_MS = 8;
const STRUCTURE_DEBOUNCE_MS = 100;

function isMarkdown(path: string): boolean {
	return extensionOf(path) === 'md';
}

/** Headings and block ids decide whether other notes' links resolve, so a change to them is structural. */
function structureSignature(note: NoteSnapshot | undefined): string {
	if (!note) return '';
	return `${note.headings.map((h) => `${h.level}${h.heading}`).join('\n')}\u0000${note.blocks.join('\n')}`;
}

/**
 * Owns the vault index and the broken-link results. Works in time-boxed slices so it never
 * blocks the UI, and updates incrementally: an edit that does not change headings or block ids
 * re-checks only that note; file creation, deletion, renames and heading changes re-check the
 * vault from the in-memory index (no file reads).
 */
export class IndexService {
	readonly index = new VaultIndex();
	private readonly broken = new Map<string, BrokenLink[]>();
	private readonly linkCounts = new Map<string, number>();
	private readonly listeners = new Set<(event: IndexEvent) => void>();
	private status: IndexStatus = { state: 'idle', done: 0, total: 0 };
	private generation = 0;
	private pendingPass: unknown = null;
	private disposed = false;

	constructor(
		private readonly port: VaultPort,
		private readonly getOptions: () => DetectOptions,
		private readonly scheduler: Scheduler = defaultScheduler,
	) {}

	getStatus(): IndexStatus {
		return this.status;
	}

	onEvent(listener: (event: IndexEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	brokenFor(path: string): BrokenLink[] {
		return this.broken.get(path) ?? [];
	}

	allBroken(): BrokenLink[] {
		const paths = [...this.broken.keys()].sort();
		return paths.flatMap((p) => this.broken.get(p) ?? []);
	}

	/** Notes with nothing but (optional) frontmatter, honouring the ignore rules. */
	emptyNotes(): string[] {
		return findEmptyNotes(this.index, this.getOptions().isIgnored);
	}

	noteCount(): number {
		return this.index.allNotes().length;
	}

	linkCount(): number {
		let total = 0;
		for (const n of this.linkCounts.values()) total += n;
		return total;
	}

	/** Full scan. Cancellable by calling `cancel()`, `scan()` again or `dispose()`. */
	async scan(): Promise<void> {
		const gen = ++this.generation;
		this.clearPending();
		this.setStatus({ state: 'scanning', done: 0, total: 0 });
		const paths = this.port.listFiles();
		const fresh = new VaultIndex();
		let sliceStart = this.scheduler.now();
		const markdown: string[] = [];
		for (const path of paths) {
			fresh.addFile(path);
			if (isMarkdown(path)) markdown.push(path);
			if (this.scheduler.now() - sliceStart > SLICE_BUDGET_MS) {
				await this.yieldToUi();
				if (this.isStale(gen)) return;
				sliceStart = this.scheduler.now();
			}
		}
		this.setStatus({ state: 'scanning', done: 0, total: markdown.length });
		let done = 0;
		sliceStart = this.scheduler.now();
		for (const path of markdown) {
			const snapshot = this.port.readSnapshot(path);
			if (snapshot) fresh.setNote(snapshot);
			done++;
			if (this.scheduler.now() - sliceStart > SLICE_BUDGET_MS) {
				this.setStatus({ state: 'scanning', done, total: markdown.length });
				await this.yieldToUi();
				if (this.isStale(gen)) return;
				sliceStart = this.scheduler.now();
			}
		}
		// Keep notes that arrived through events while the scan was running.
		for (const note of this.index.allNotes()) if (!fresh.getNote(note.path) && fresh.hasFile(note.path)) fresh.setNote(note);
		this.swapIndex(fresh);
		await this.recomputeAll(gen);
		if (this.isStale(gen)) return;
		this.setStatus({ state: 'ready', done: markdown.length, total: markdown.length });
		this.emit({ kind: 'updated', paths: 'all' });
	}

	cancel(): void {
		this.generation++;
		this.clearPending();
	}

	dispose(): void {
		this.disposed = true;
		this.cancel();
		this.listeners.clear();
	}

	/** Re-checks every note against the current options (for example after a settings change). */
	refreshOptions(): void {
		this.scheduleFullPass();
	}

	upsertNote(snapshot: NoteSnapshot): void {
		if (this.disposed) return;
		const before = this.index.getNote(snapshot.path);
		const isNew = !this.index.hasFile(snapshot.path);
		const structural = isNew || structureSignature(before) !== structureSignature(snapshot);
		this.index.setNote(snapshot);
		if (this.status.state !== 'ready') return;
		if (structural) {
			this.scheduleFullPass();
			return;
		}
		this.recheckNote(snapshot);
		this.emit({ kind: 'updated', paths: [snapshot.path] });
	}

	addFile(path: string): void {
		if (this.disposed || this.index.hasFile(path)) return;
		this.index.addFile(path);
		if (isMarkdown(path)) {
			const snapshot = this.port.readSnapshot(path);
			if (snapshot) this.index.setNote(snapshot);
		}
		this.scheduleFullPass();
	}

	removeFile(path: string): void {
		if (this.disposed) return;
		this.index.removeFile(path);
		this.broken.delete(path);
		this.linkCounts.delete(path);
		this.scheduleFullPass();
	}

	renameFile(oldPath: string, newPath: string): void {
		if (this.disposed) return;
		this.index.removeFile(oldPath);
		this.broken.delete(oldPath);
		this.linkCounts.delete(oldPath);
		this.addFile(newPath);
		this.scheduleFullPass();
	}

	private swapIndex(fresh: VaultIndex): void {
		for (const path of this.index.allFiles()) this.index.removeFile(path);
		for (const path of fresh.allFiles()) this.index.addFile(path);
		for (const note of fresh.allNotes()) this.index.setNote(note);
	}

	private recheckNote(note: NoteSnapshot): void {
		const found = detectNote(note, this.index, this.getOptions());
		if (found.length > 0) this.broken.set(note.path, found);
		else this.broken.delete(note.path);
		this.linkCounts.set(note.path, note.links.length);
	}

	private async recomputeAll(gen: number): Promise<void> {
		const options = this.getOptions();
		const nextBroken = new Map<string, BrokenLink[]>();
		const nextCounts = new Map<string, number>();
		let sliceStart = this.scheduler.now();
		for (const note of this.index.allNotes()) {
			const found = detectNote(note, this.index, options);
			if (found.length > 0) nextBroken.set(note.path, found);
			nextCounts.set(note.path, note.links.length);
			if (this.scheduler.now() - sliceStart > SLICE_BUDGET_MS) {
				await this.yieldToUi();
				if (this.isStale(gen)) return;
				sliceStart = this.scheduler.now();
			}
		}
		this.broken.clear();
		for (const [k, v] of nextBroken) this.broken.set(k, v);
		this.linkCounts.clear();
		for (const [k, v] of nextCounts) this.linkCounts.set(k, v);
	}

	private scheduleFullPass(): void {
		if (this.disposed || this.status.state === 'scanning') return;
		this.clearPending();
		this.pendingPass = this.scheduler.setTimeout(() => {
			this.pendingPass = null;
			const gen = ++this.generation;
			void this.recomputeAll(gen).then(() => {
				if (!this.isStale(gen)) this.emit({ kind: 'updated', paths: 'all' });
			});
		}, STRUCTURE_DEBOUNCE_MS);
	}

	private clearPending(): void {
		if (this.pendingPass !== null) {
			this.scheduler.clearTimeout(this.pendingPass);
			this.pendingPass = null;
		}
	}

	private isStale(gen: number): boolean {
		return this.disposed || gen !== this.generation;
	}

	private yieldToUi(): Promise<void> {
		return new Promise((resolve) => this.scheduler.setTimeout(resolve, 0));
	}

	private setStatus(status: IndexStatus): void {
		this.status = status;
		this.emit({ kind: 'status' });
	}

	private emit(event: IndexEvent): void {
		if (this.disposed) return;
		for (const listener of [...this.listeners]) listener(event);
	}
}
