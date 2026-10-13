// Copies the built plugin into test-vault/.obsidian/plugins/link-doctor and enables it.
// Usage: npm run build && node scripts/install-to-test-vault.mjs [vault-path]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const vault = process.argv[2] ?? 'test-vault';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const dir = join(vault, '.obsidian', 'plugins', manifest.id);

for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	if (!existsSync(file)) {
		console.error(`${file} not found. Run "npm run build" first.`);
		process.exit(1);
	}
}
mkdirSync(dir, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(file, join(dir, file));

const listPath = join(vault, '.obsidian', 'community-plugins.json');
const enabled = existsSync(listPath) ? JSON.parse(readFileSync(listPath, 'utf8')) : [];
if (!enabled.includes(manifest.id)) enabled.push(manifest.id);
writeFileSync(listPath, JSON.stringify(enabled, null, 2));
console.log(`Installed ${manifest.id} ${manifest.version} into ${dir}`);
console.log('Open the vault in Obsidian. If prompted, turn off restricted mode for this vault.');
