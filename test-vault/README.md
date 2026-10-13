# Fixture vault

Shared source of truth for automated and manual checks. Every note here is deliberate.
`tests/unit/fixture-vault.test.ts` asserts the counts below; update both together.

Link types: 1 missing note, 2 missing heading, 3 missing block, 4 missing embed, 5 missing Markdown link target.

| Note | Expected broken links | What it covers |
|---|---|---|
| `Home.md` | 0 | Healthy hub: wikilink, heading, block, alias, embed, Markdown link, external URLs |
| `Healthy note.md` | 0 | Target for headings (nested, duplicate, special characters), a block id and an alias |
| `Folder with spaces/Spaced note.md` | 0 | Folder name with spaces |
| `Folder with spaces/Relative.md` | 1 | Type 1 via `../Nothing`; `./` and `../` links that resolve |
| `Broken/Missing notes.md` | 3 | Type 1 (typo, no match, alias text); code spans and fences ignored |
| `Broken/Missing headings.md` | 4 | Type 2 (typo, no match, same-note, nested under the wrong parent) |
| `Broken/Missing blocks.md` | 2 | Type 3 (typo, same-note) |
| `Broken/Missing embeds.md` | 3 | Type 4 (attachment, note, Markdown image) |
| `Broken/Missing markdown links.md` | 3 | Type 5 x2 (encoded, angle brackets) and a Markdown link to a missing heading (type 2) |
| `Edge/Unicode.md` | 2 | Type 1 x2: missing accent and a CJK typo; healthy accented, CJK, emoji and RTL links |
| `Edge/Aliases.md` | 1 | Type 1: a bare alias is not a link target |
| `Edge/Case.md` | 0 | Case-insensitive resolution |
| `Edge/crlf-note.md` | 2 | Type 1 x2 in a file with CRLF line endings (never normalise this file) |
| `Edge/Café.md`, `日本語ノート.md`, `🙂 Emoji note.md`, `שלום.md` | 0 | Targets for the Unicode note |
| `Templates/Template.md` | 2 | Type 1 x2, but ignored when the rule `Templates/` is set |

Totals: 23 broken links, or **21** with `Templates/` ignored.
By type with `Templates/` ignored: missing note 9, missing heading 5, missing block 2, missing embed 3, missing Markdown target 2.

## NFD file names

Committing NFD (decomposed) file names is unreliable because Git on macOS normalises them. Generate them locally with:

```
node scripts/make-nfd-fixture.mjs
```

This writes `Edge/generated/` (git-ignored) with an NFD-named note and a note linking to it with an NFC link, which must **not** be reported as broken. The unit tests cover NFC against NFD in memory on every platform.

## Using it manually

Open `test-vault/` as a vault in Obsidian, then copy or symlink a built plugin into `test-vault/.obsidian/plugins/link-doctor/`. See `docs/manual-testing.md`.
