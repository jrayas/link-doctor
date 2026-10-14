# Link Doctor

Find the broken links in your vault, see exactly where they are and jump straight to them. Link Doctor checks wikilinks, heading and block links, embeds and Markdown links, shows them in a side panel and a dashboard, and lists notes that have no content apart from frontmatter.

It works on macOS, Windows, Linux, iOS, iPadOS and Android. It makes no network requests and sends no telemetry.

## What it finds

| Type | Example |
|---|---|
| Missing note | `[[Note that does not exist]]` |
| Missing heading | `[[Existing note#No such heading]]` |
| Missing block | `[[Existing note#^no-such-block]]` |
| Missing embed | `![[missing.png]]` |
| Missing Markdown link target | `[text](folder/missing.md)` |

External web links (`https://…`) are not checked. Links inside code spans and code blocks are ignored, as Obsidian ignores them too.

It follows Obsidian's own rules for resolving links: names are matched without regard to case, accents are compared in normalised form (so a file saved with decomposed accents on macOS still matches), relative paths such as `../Note` work, and aliases count.

## Using it

**Side panel.** Click the stethoscope icon in the ribbon, or run **Link doctor: Open panel**.

- **Current** shows the broken links in the note you are looking at and follows you as you switch notes or edit.
- **All** shows every broken link in the vault, plus any empty notes.
- Click a row, or tab to it and press Enter, to open the note with the link selected.

**Dashboard.** Click the grid icon in the panel, or run **Link doctor: Open dashboard**.

- Summary: notes, links, broken links and the healthy percentage, with a breakdown by type.
- Search as you type, filter by link type and folder, sort, and group by note.
- **Link** opens the note at the broken link.
- **Empty notes** lists notes with only frontmatter or blank lines, with an **Open** button.

**Commands.** Open panel, Open dashboard, Rescan vault, Undo last fix, and Show diagnostics for the current note (a debugging aid that shows what Obsidian's cache says about the open note).

## Settings

| Setting | What it does |
|---|---|
| Default panel mode, Remember last panel mode | Start in Current or All, or in whichever you used last. |
| Open notes in a new tab | New tab, or reuse the current tab. |
| Link types to check | Switch each of the five types on or off. |
| Ignore rules | Skip notes by path with simple patterns (one per line), for example `Templates/` or `Archive/**` or `*.canvas`. Regular expressions are not supported. |
| Refresh automatically, Refresh delay | Re-check after edits, and how long to wait after typing stops. |
| Reset to defaults | Restores every option; your notes are untouched. |

## Limitations

- It reads Obsidian's metadata cache, so it sees what Obsidian sees. A link inside a note that Obsidian has not indexed yet appears after indexing finishes.
- It lists broken links and takes you to them. It does not currently offer buttons to fix them in the interface.
- Only local links are checked; external URLs, orphan notes and unused attachments are out of scope.
- A note that is mid-sync (iCloud, OneDrive, Dropbox, Sync) may briefly show links as broken until its target arrives; use **Rescan vault** if it does not clear.
- Heading matching follows Obsidian's own normalisation. Unusual punctuation in headings is the most likely source of a false report; please open an issue with an example.

## Privacy and safety

No network calls, no telemetry and no account. Link Doctor reads notes only through Obsidian's metadata cache and never changes your notes from the panel or dashboard.

## Installing

Once listed, install it from **Settings → Community plugins**. To try a build by hand, copy `main.js`, `manifest.json` and `styles.css` from a release into `<your vault>/.obsidian/plugins/link-doctor/`, then enable it.

## Development

```
npm install
npm run dev            # watch build
npm run verify         # lint, typecheck, tests, build and bundle check
npm run bench          # performance of the engine on a synthetic 5,000-note vault
npm run install:test-vault
```

Needs Node 22 or later; every script is Node-based and runs on macOS, Windows and Linux. The engine in `src/core` is pure TypeScript with no Obsidian import; `src/adapters` wraps Obsidian; `src/ui` holds the views. See `docs/plan.md`, `docs/research-notes.md` and `docs/manual-testing.md`.

## Licence

MIT. See `LICENSE`.
