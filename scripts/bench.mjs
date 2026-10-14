// Usage: node scripts/bench.mjs   (BENCH_NOTES and BENCH_LINKS override the size)
// Bundles the pure engine with esbuild and times a synthetic vault. Runs on macOS, Windows and Linux.
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'link-doctor-bench-'));
const out = join(dir, 'bench.mjs');
try {
	await build({ entryPoints: ['scripts/bench-entry.mjs'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
	await import(pathToFileURL(out).href);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
