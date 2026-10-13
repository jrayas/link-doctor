# Manual testing

Expanded in Phase 8 (mobile emulation, real-device checklist). Current checks:

## Install the build into the fixture vault

```
npm run install:test-vault
```

Then open `test-vault/` as a vault in Obsidian (Open folder as vault). If asked, turn off restricted mode. The plugin is enabled automatically. After rebuilding, run the command again and reload with *Reload app without saving* from the command palette.

## Phase 4: side panel

1. Click the stethoscope ribbon icon, or run **Link doctor: Open panel**. The panel opens in the right sidebar.
2. Open `Broken/Missing notes.md`. Current shows 3 rows with type, line, and a snippet.
3. Switch to **All**: 21 rows are shown with the source path (23 if `Templates/` is not ignored; ignore rules arrive in Phase 7, so expect 23 for now).
4. Click a row (or tab to it and press Enter or Space): the note opens with the link selected. Check this in editing and reading view.
5. Switch notes: the panel follows. Open `diagram.png` (an attachment): a friendly "Not a Markdown note" message appears.
6. Edit a link in the active note so it becomes valid, wait for the debounce: the row disappears.
7. Close all notes: "No note open" appears.
8. Mobile emulation: run `this.app.emulateMobile(true)` in the developer console; the panel must stay usable at phone width and rows must be tappable.

## Verifying the cache assumptions (do this once)

Open each note listed below and run **Link doctor: Show diagnostics for the current note**. Compare the JSON with `docs/research-notes.md` section 4 **(verify)** and note the answers there:

- `Broken/Missing headings.md`: are missing headings absent from `obsidianUnresolved` (expected: yes)?
- `Broken/Missing embeds.md`: do missing embeds appear in `obsidianUnresolved`?
- `Broken/Missing markdown links.md`: how is `link` stored (percent-encoded, angle brackets)? Do these links appear in `obsidianUnresolved`?
- `Folder with spaces/Relative.md`: do `./` and `../` links resolve in Obsidian, and does our result agree?
- `Edge/Case.md`: does `[[healthy NOTE]]` resolve in Obsidian?
- `Edge/Aliases.md`: is a bare alias unresolved?
- `Broken/Missing notes.md`: are links inside code spans or fences absent from the cache?
- `Edge/crlf-note.md`: are the reported lines 5 and 6?
