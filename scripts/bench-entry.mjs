// Bundled and run by scripts/bench.mjs. Pure engine only: no Obsidian API is involved.
import { IndexService } from '../src/adapters/index-service';
import { detectAll } from '../src/core/detect';
import { VaultIndex } from '../src/core/resolve';

const NOTES = Number(process.env.BENCH_NOTES ?? 5000);
const LINKS_PER_NOTE = Number(process.env.BENCH_LINKS ?? 10);
const BROKEN_RATE = 0.05;

// Small seeded generator so every run builds the same vault.
let seed = 123456789;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (n) => Math.floor(rand() * n);

const folders = Array.from({ length: 50 }, (_, i) => `Folder ${i}`);
const paths = Array.from({ length: NOTES }, (_, i) => `${folders[i % folders.length]}/Note ${i}.md`);
const headingsOf = (i) => [`Heading ${i % 7}`, `Section ${i % 5}`];

function makeSnapshot(i) {
	const links = [];
	let offset = 0;
	for (let k = 0; k < LINKS_PER_NOTE; k++) {
		const broken = rand() < BROKEN_RATE;
		const target = pick(NOTES);
		const roll = rand();
		let link = `Note ${target}`;
		if (broken) link = `Missing ${pick(1e6)}`;
		else if (roll < 0.2) link = `Note ${target}#${headingsOf(target)[0]}`;
		else if (roll < 0.3) link = `${folders[target % folders.length]}/Note ${target}`;
		const original = `[[${link}]]`;
		links.push({ original, link, start: { line: k, col: 0, offset }, end: { line: k, col: original.length, offset: offset + original.length } });
		offset += original.length + 1;
	}
	return { path: paths[i], aliases: [], links, headings: headingsOf(i).map((heading) => ({ heading, level: 2 })), blocks: [] };
}

const snapshots = paths.map((_, i) => makeSnapshot(i));
const byPath = new Map(snapshots.map((s) => [s.path, s]));
const port = { listFiles: () => paths, readSnapshot: (p) => byPath.get(p) ?? null };

let longestSlice = 0;
let sliceStart = performance.now();
const slices = [];
const scheduler = {
	setTimeout: (fn, ms) => {
		slices.push(performance.now() - sliceStart);
		longestSlice = Math.max(longestSlice, performance.now() - sliceStart);
		return setTimeout(() => {
			sliceStart = performance.now();
			fn();
		}, ms);
	},
	clearTimeout: (h) => clearTimeout(h),
	now: () => performance.now(),
};

const service = new IndexService(port, () => ({}), scheduler);
const heapBefore = process.memoryUsage().heapUsed;
const t0 = performance.now();
sliceStart = t0;
await service.scan();
const scanMs = performance.now() - t0;
longestSlice = Math.max(longestSlice, performance.now() - sliceStart);
const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1048576;

// Pure engine time, with no yielding to the UI.
const index = new VaultIndex();
for (const s of snapshots) index.setNote(s);
const t1 = performance.now();
const broken = detectAll(index);
const detectMs = performance.now() - t1;

// One edited note that does not change headings or blocks.
const samples = [];
for (let n = 0; n < 200; n++) {
	const s = snapshots[pick(NOTES)];
	const t = performance.now();
	service.upsertNote({ ...s });
	samples.push(performance.now() - t);
}
samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)];
const p95 = samples[Math.floor(samples.length * 0.95)];
service.dispose();
if (process.env.BENCH_SLICES) console.error(slices.map((x) => x.toFixed(1)).join(' '));

const links = NOTES * LINKS_PER_NOTE;
console.log(JSON.stringify({
	notes: NOTES,
	links,
	broken: broken.length,
	scanWallMs: Math.round(scanMs),
	longestSliceMs: Number(longestSlice.toFixed(1)),
	engineOnlyDetectMs: Math.round(detectMs),
	singleEditMedianMs: Number(median.toFixed(3)),
	singleEditP95Ms: Number(p95.toFixed(3)),
	heapGrowthMb: Number(heapMb.toFixed(1)),
	node: process.version,
	platform: `${process.platform} ${process.arch}`,
}, null, 2));
