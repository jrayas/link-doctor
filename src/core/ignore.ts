import { foldName, toForwardSlashes } from './text';

/**
 * Glob rules, one per line. `#` starts a comment.
 * - `Templates/` or `Templates`: that folder and everything inside it (at any depth if it has no `/`)
 * - `*` any characters except `/`, `**` any characters including `/`, `?` one character
 * - `*.excalidraw.md`: a pattern without `/` matches any file or folder name
 * Matching ignores case and Unicode normalisation form. There is deliberately no regex support.
 */
export function compileIgnoreRules(rules: readonly string[]): (path: string) => boolean {
	const matchers: RegExp[] = [];
	for (const raw of rules) {
		const rule = raw.trim();
		if (rule === '' || rule.startsWith('#')) continue;
		const re = globToRegExp(rule);
		if (re) matchers.push(re);
	}
	if (matchers.length === 0) return () => false;
	return (path) => {
		const key = foldName(toForwardSlashes(path));
		return matchers.some((m) => m.test(key));
	};
}

function globToRegExp(rule: string): RegExp | null {
	let glob = foldName(toForwardSlashes(rule)).replace(/^\/+/, '');
	const folderOnly = glob.endsWith('/');
	glob = glob.replace(/\/+$/, '');
	if (glob === '') return null;
	const anchored = glob.includes('/');
	let body = '';
	for (let i = 0; i < glob.length; i++) {
		const c = glob.charAt(i);
		if (c === '*') {
			if (glob.charAt(i + 1) === '*') {
				i++;
				if (glob.charAt(i + 1) === '/') {
					i++;
					body += '(?:.*/)?';
				} else {
					body += '.*';
				}
			} else {
				body += '[^/]*';
			}
		} else if (c === '?') {
			body += '[^/]';
		} else {
			body += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
		}
	}
	// The rule matches the path itself or any parent folder of it.
	const prefix = anchored ? '^' : '(?:^|/)';
	const tail = folderOnly ? '/' : '(?:/|$)';
	try {
		return new RegExp(`${prefix}${body}${tail}`);
	} catch {
		return null;
	}
}
