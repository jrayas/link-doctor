// Detects APIs that do not exist on mobile (Node, Electron) and regex lookbehind
// (unsupported on iOS before 16.4). Shared by the unit test and the bundle check.
import { builtinModules } from 'node:module';

const builtins = new Set(builtinModules.map((m) => m.replace(/^node:/, '').split('/')[0]));
const allowedRequires = [/^obsidian$/, /^@codemirror\//, /^@lezer\//];

/** Returns a list of human-readable problems found in `source`. */
export function findForbidden(source, label = 'source') {
	const problems = [];
	const specifiers = [];
	const patterns = [
		/\bimport\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
		/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
		/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
	];
	for (const re of patterns) {
		for (const m of source.matchAll(re)) specifiers.push(m[1]);
	}
	for (const spec of specifiers) {
		const bare = spec.replace(/^node:/, '');
		const root = bare.split('/')[0];
		if (spec.startsWith('node:') || builtins.has(root) || root === 'electron') {
			problems.push(`${label}: forbidden Node/Electron import "${spec}"`);
		} else if (!spec.startsWith('.') && !allowedRequires.some((re) => re.test(spec))) {
			if (label.endsWith('main.js')) problems.push(`${label}: unexpected runtime require "${spec}"`);
		}
	}
	if (/\brequire\s*\(\s*[^'"\s)]/.test(source)) {
		problems.push(`${label}: dynamic require() is not allowed`);
	}
	if (/\(\?<[=!]/.test(source)) {
		problems.push(`${label}: regex lookbehind is not supported on older iOS`);
	}
	return problems;
}
