import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findForbidden } from '../../scripts/forbidden.mjs';

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

describe('forbidden API scanner', () => {
	it('flags Node and Electron imports', () => {
		expect(findForbidden(`import fs from 'fs';`)).toHaveLength(1);
		expect(findForbidden(`import { join } from "node:path";`)).toHaveLength(1);
		expect(findForbidden(`const e = require('electron');`)).toHaveLength(1);
		expect(findForbidden(`import('os')`)).toHaveLength(1);
	});

	it('flags regex lookbehind', () => {
		expect(findForbidden(`const r = /(?${'<='}a)b/;`)).toHaveLength(1);
		expect(findForbidden(`const r = /(?${'<!'}a)b/;`)).toHaveLength(1);
	});

	it('allows obsidian and relative imports', () => {
		expect(findForbidden(`import { Plugin } from 'obsidian';\nimport x from './x';`)).toEqual([]);
	});

	it('only permits obsidian-provided requires in a bundle', () => {
		expect(findForbidden(`require("obsidian");`, 'main.js')).toEqual([]);
		expect(findForbidden(`require("lodash");`, 'main.js')).toHaveLength(1);
	});

	it('finds nothing in the plugin source', () => {
		const problems = walk('src')
			.filter((f) => f.endsWith('.ts'))
			.flatMap((f) => findForbidden(readFileSync(f, 'utf8'), f));
		expect(problems).toEqual([]);
	});
});
