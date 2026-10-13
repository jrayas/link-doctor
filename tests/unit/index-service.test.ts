import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexService, type IndexEvent, type Scheduler, type VaultPort } from '../../src/adapters/index-service';
import type { NoteSnapshot } from '../../src/core/types';
import { link, note } from '../helpers/build';

class FakePort implements VaultPort {
	notes = new Map<string, NoteSnapshot>();
	files: string[] = [];
	reads = 0;
	listFiles() {
		return [...this.files];
	}
	readSnapshot(path: string) {
		this.reads++;
		return this.notes.get(path) ?? null;
	}
	add(n: NoteSnapshot) {
		this.notes.set(n.path, n);
		this.files.push(n.path);
	}
}

const fake: Scheduler = {
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
	now: () => Date.now(),
};

function fixture() {
	const port = new FakePort();
	port.add(note('A.md', { links: [link('[[B]]', 'B', 0), link('[[Gone]]', 'Gone', 1)] }));
	port.add(note('B.md', { headings: [{ heading: 'Top', level: 1 }] }));
	port.files.push('pic.png');
	const service = new IndexService(port, () => ({}), fake);
	return { port, service };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('IndexService scan', () => {
	it('reports idle, scanning and ready, and finds the broken links', async () => {
		const { service } = fixture();
		const events: IndexEvent[] = [];
		service.onEvent((e) => events.push(e));
		expect(service.getStatus().state).toBe('idle');
		const done = service.scan();
		expect(service.getStatus().state).toBe('scanning');
		await vi.runAllTimersAsync();
		await done;
		expect(service.getStatus()).toEqual({ state: 'ready', done: 2, total: 2 });
		expect(service.brokenFor('A.md').map((b) => b.original)).toEqual(['[[Gone]]']);
		expect(service.allBroken()).toHaveLength(1);
		expect(service.noteCount()).toBe(2);
		expect(service.linkCount()).toBe(2);
		expect(events.at(-1)).toEqual({ kind: 'updated', paths: 'all' });
	});

	it('does not read attachments and tolerates notes not yet cached', async () => {
		const { port, service } = fixture();
		port.files.push('Uncached.md');
		const done = service.scan();
		await vi.runAllTimersAsync();
		await done;
		expect(port.reads).toBe(3);
		expect(service.noteCount()).toBe(2);
	});

	it('can be cancelled and leaves no timers running', async () => {
		const { service } = fixture();
		const done = service.scan();
		service.cancel();
		await vi.runAllTimersAsync();
		await done;
		expect(service.getStatus().state).toBe('scanning');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('yields to the UI on a big vault instead of blocking', async () => {
		const port = new FakePort();
		for (let i = 0; i < 400; i++) port.add(note(`N${i}.md`, { links: [link('[[Nope]]', 'Nope')] }));
		let clock = 0;
		const ticking: Scheduler = { ...fake, now: () => (clock += 3) };
		const service = new IndexService(port, () => ({}), ticking);
		const progress: number[] = [];
		service.onEvent(() => progress.push(service.getStatus().done));
		const done = service.scan();
		await vi.runAllTimersAsync();
		await done;
		expect(progress.filter((p) => p > 0 && p < 400).length).toBeGreaterThan(5);
		expect(service.allBroken()).toHaveLength(400);
	});
});

describe('IndexService incremental updates', () => {
	async function ready() {
		const f = fixture();
		const done = f.service.scan();
		await vi.runAllTimersAsync();
		await done;
		return f;
	}

	it('re-checks only the edited note when headings and blocks are unchanged', async () => {
		const { service } = await ready();
		const events: IndexEvent[] = [];
		service.onEvent((e) => events.push(e));
		service.upsertNote(note('A.md', { links: [link('[[B]]', 'B', 0)] }));
		expect(service.brokenFor('A.md')).toEqual([]);
		expect(events).toEqual([{ kind: 'updated', paths: ['A.md'] }]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('re-checks other notes when headings change', async () => {
		const { service } = await ready();
		service.upsertNote(note('A.md', { links: [link('[[B#Top]]', 'B#Top', 0)] }));
		expect(service.brokenFor('A.md')).toEqual([]);
		service.upsertNote(note('B.md', { headings: [{ heading: 'Other', level: 1 }] }));
		await vi.runAllTimersAsync();
		expect(service.brokenFor('A.md').map((b) => b.type)).toEqual(['missing-heading']);
	});

	it('picks up a newly created note that fixes a link, in one debounced pass', async () => {
		const { port, service } = await ready();
		port.add(note('Gone.md'));
		service.addFile('Gone.md');
		service.addFile('Gone.md');
		expect(vi.getTimerCount()).toBe(1);
		await vi.runAllTimersAsync();
		expect(service.brokenFor('A.md')).toEqual([]);
	});

	it('handles deletion and rename', async () => {
		const { port, service } = await ready();
		service.removeFile('B.md');
		await vi.runAllTimersAsync();
		expect(service.brokenFor('A.md').map((b) => b.original)).toEqual(['[[B]]', '[[Gone]]']);
		port.add(note('Renamed.md'));
		service.renameFile('Old.md', 'Renamed.md');
		await vi.runAllTimersAsync();
		expect(service.index.hasFile('Renamed.md')).toBe(true);
	});

	it('re-checks with new options', async () => {
		const port = new FakePort();
		port.add(note('A.md', { links: [link('[[Gone]]', 'Gone')] }));
		let ignored = false;
		const service = new IndexService(port, () => ({ isIgnored: () => ignored }), fake);
		const done = service.scan();
		await vi.runAllTimersAsync();
		await done;
		expect(service.allBroken()).toHaveLength(1);
		ignored = true;
		service.refreshOptions();
		await vi.runAllTimersAsync();
		expect(service.allBroken()).toHaveLength(0);
	});

	it('stops emitting and clears timers after dispose', async () => {
		const { service } = await ready();
		const listener = vi.fn();
		service.onEvent(listener);
		service.addFile('X.md');
		service.dispose();
		await vi.runAllTimersAsync();
		expect(listener).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		service.upsertNote(note('A.md'));
		expect(listener).not.toHaveBeenCalled();
	});
});
