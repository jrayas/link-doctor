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

## Phase 5: fixes, preview and undo

Run these on a **copy** of the fixture vault if you want to keep it pristine (or use *Undo* and `git checkout test-vault`).

1. Open `Broken/Missing notes.md`, expand **Fix** on `[[Healthy nots]]`. The top suggestion is "Use Healthy note" with a "High match" label. "Create missing note" and "Remove link, keep text" are also offered.
2. Tap the suggestion. A preview shows the **Before** and **After** lines. Cancel: nothing changes. Repeat and **Apply fix**: the link is rewritten, a notice appears with an **Undo** button, and the row disappears.
3. Tap **Undo** in the notice (or the undo icon in the panel toolbar, or the command **Undo last fix**): the original text returns exactly.
4. `Broken/Missing headings.md`: fix `[[Healthy note#Section won]]`. Only the heading part changes; an alias, if present, is kept.
5. `Broken/Missing markdown links.md`: fix `[bad heading](Healthy%20note.md#Nope)`. It must stay a Markdown link.
6. `Edge/crlf-note.md`: remove or fix a link, then check the line endings are still CRLF (for example with `file` or an editor's status bar) and that undo restores the file exactly.
7. Create missing note on `[[Does not exist]]`: the preview shows the path (your "default location for new notes" setting decides the folder). After creating, undo moves the empty note to the trash. Type something in it first, then undo: it must refuse and keep the note.
8. A name with unsafe characters such as `[[What? A:note]]` shows a warning in the preview and a sanitised file name.
9. Edit the note while a preview is open and apply: you should get "The note has changed since the scan" and no edit.
10. On a phone-width window (`this.app.emulateMobile(true)`): the preview modal scrolls, **Cancel** and **Apply fix** are reachable, and every button is at least 44 px tall.
11. Turn off *Confirm before applying* (settings tab arrives in Phase 7; until then edit `data.json` with `"confirmBeforeFix": false`): the fix applies immediately with an Undo notice.
