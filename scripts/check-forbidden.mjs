// Usage: node scripts/check-forbidden.mjs --bundle   (checks the built main.js)
//        node scripts/check-forbidden.mjs              (checks src/ only)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden } from './forbidden.mjs';

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

const problems = [];
if (process.argv.includes('--bundle')) {
	if (!existsSync('main.js')) {
		console.error('main.js not found. Run "npm run build" first.');
		process.exit(1);
	}
	problems.push(...findForbidden(readFileSync('main.js', 'utf8'), 'main.js'));
} else {
	for (const file of walk('src').filter((f) => f.endsWith('.ts'))) {
		problems.push(...findForbidden(readFileSync(file, 'utf8'), file));
	}
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log('No forbidden Node/Electron APIs or lookbehind found.');
