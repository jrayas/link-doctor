import { describe, expect, it } from 'vitest';
import type { IndexStatus } from '../../src/adapters/index-service';
import type { BrokenLink } from '../../src/core/types';
import { computePanelState } from '../../src/ui/panel-model';

const ready: IndexStatus = { state: 'ready', done: 1, total: 1 };

function broken(path: string, line: number): BrokenLink {
	return {
		id: `${path}:${line}:0`, sourcePath: path, type: 'missing-note', syntax: 'wikilink', embed: false,
		original: '[[X]]', target: 'X', subpath: '',
		start: { line, col: 0, offset: 0 }, end: { line, col: 5, offset: 5 },
	};
}

const base = { mode: 'current' as const, currentPath: 'A.md', status: ready, brokenForCurrent: [], allBroken: [], limit: 100 };

describe('computePanelState', () => {
	it('shows progress while scanning or before the first scan', () => {
		expect(computePanelState({ ...base, status: { state: 'scanning', done: 3, total: 10 } })).toEqual({ kind: 'scanning', done: 3, total: 10 });
		expect(computePanelState({ ...base, status: { state: 'idle', done: 0, total: 0 } }).kind).toBe('scanning');
	});

	it('handles no active note and non-Markdown files', () => {
		expect(computePanelState({ ...base, currentPath: null })).toEqual({ kind: 'no-note' });
		expect(computePanelState({ ...base, currentPath: 'img/pic.png' })).toEqual({ kind: 'unsupported', name: 'pic.png' });
	});

	it('shows a friendly empty state per mode', () => {
		expect(computePanelState(base)).toEqual({ kind: 'empty', mode: 'current' });
		expect(computePanelState({ ...base, mode: 'all' })).toEqual({ kind: 'empty', mode: 'all' });
	});

	it('does not need an open note in All mode', () => {
		const state = computePanelState({ ...base, mode: 'all', currentPath: null, allBroken: [broken('B.md', 2)] });
		expect(state.kind).toBe('list');
	});

	it('lists rows with one-based lines and caps the count', () => {
		const many = Array.from({ length: 5 }, (_, i) => broken('A.md', i));
		const state = computePanelState({ ...base, brokenForCurrent: many, limit: 3 });
		expect(state.kind).toBe('list');
		if (state.kind === 'list') {
			expect(state.rows.map((r) => r.line)).toEqual([1, 2, 3]);
			expect(state.hidden).toBe(2);
			expect(state.rows[0]).toMatchObject({ sourceName: 'A', typeLabel: 'Missing note', text: '[[X]]' });
		}
	});
});
