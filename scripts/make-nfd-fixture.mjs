// Writes NFD-named fixture notes into test-vault/Edge/generated/ (git-ignored).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('test-vault', 'Edge', 'generated');
mkdirSync(dir, { recursive: true });

const nfdName = 'Café NFD';
const nfcLink = nfdName.normalize('NFC');
writeFileSync(join(dir, `${nfdName}.md`), `# ${nfcLink}\n`);
writeFileSync(
	join(dir, 'NFC link to NFD file.md'),
	`# NFC link to NFD file\n\n- [[${nfcLink}]] must resolve (0 broken).\n- [[${nfcLink} missing]] is broken (1 broken).\n`,
);
console.log(`Wrote ${dir}. File names on disk may be normalised by your file system.`);
