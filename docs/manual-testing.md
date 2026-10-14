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

## Phases 5 and 6: dashboard, fixes, preview and undo

Fixes live in the dashboard; the side panel only lists and jumps. Run these on a copy of the fixture vault, or restore it afterwards with `git checkout test-vault`.

Open the dashboard with the toolbar button in the side panel, or the command **Open dashboard**.

1. The summary shows notes, links, broken count and healthy percentage, a bar, the notes with the most broken links, and one chip per link type with its count.
2. **Search**: type `healthy` and the list filters as you type. Click a chip to filter by type (click again to clear). Pick a folder. Change **Sort by**. Toggle **Grouped by note**. Tap a note under "Notes with the most broken links" to filter to it. "Nothing matches" offers **Clear filters**.
3. Each row shows the link, its type, the line, a suggested fix with a High, Medium or Low match label, and the buttons **Apply suggestion**, **More fixes** and **Go to link**. Suggestions appear a moment after the list.
4. `[[Healthy nots]]`: **Apply suggestion** opens a preview with Before and After lines. **Cancel** changes nothing. **Apply fix** rewrites the link, and a notice with an **Undo** button appears.
5. Undo from the notice, from the undo icon in the dashboard header, or with the command **Undo last fix**: the original text returns exactly.
6. **More fixes** shows up to three suggestions, **Create missing note** (missing notes only) and **Remove link, keep text**.
7. `[[Healthy note#Section won]]`: only the heading part changes, an alias is kept. `[bad heading](Healthy%20note.md#Nope)` stays a Markdown link.
8. `Edge/crlf-note.md`: fix or remove a link, then confirm the file still has CRLF endings and undo restores it exactly.
9. Create missing note on `[[Does not exist]]`: the preview shows the path (Obsidian's "default location for new notes" decides the folder). Undo moves the empty note to the trash. Type in it first and undo again: it must refuse.
10. `[[What? A:note]]`: the preview warns about the sanitised file name.
11. Edit the note while a preview is open, then apply: "The note has changed since the scan" and no edit.
12. **Go to link** opens the note in a new tab with the link selected and does not replace the dashboard.
13. Phone width (`this.app.emulateMobile(true)` and a narrow pane): the table becomes cards, buttons are at least 44 px tall, the preview modal scrolls and its buttons stay reachable.
14. With *Confirm before applying* off (edit `data.json` to `"confirmBeforeFix": false` until the Phase 7 settings tab exists): fixes apply immediately with an Undo notice.

## Phase 7: settings

Open Settings, then Link Doctor.

1. Add `Templates/` under **Ignored folders and patterns**: after about a second the dashboard total drops from 23 to 21 and `Templates/Template.md` disappears. A line such as `^Archive/.*$` shows a note that regular expressions are not supported.
2. Switch off **Missing embed** under **Link types to check**: embeds vanish from the panel and dashboard. Switch it back on.
3. Set **Default panel mode** to All, close and reopen the panel: it opens in All. Turn on **Remember last panel mode**, switch to Current, reload: it starts in Current.
4. **Match strictness**: at the high end `[[Healthy nots]]` still gets a suggestion, `[[Cafe]]` may not. At the low end more suggestions appear.
5. Turn off **Refresh automatically**: the refresh delay slider greys out and edits no longer update results until you press the rescan button. Turn it back on: a rescan runs.
6. Change **Refresh delay** to 3000: results update about three seconds after an edit.
7. Turn off **Confirm before applying a fix**: fixes apply at once with an Undo notice.
8. **Reset to defaults** asks for confirmation, then restores everything, including the ignore rules.
9. Edit `data.json` in the plugin folder to something broken, for example `{"fuzzyThreshold": "high", "ignoreRules": 5}`, and reload: the plugin loads with defaults for those fields and no errors in the console.
10. **Open notes in a new tab**: on, the dashboard **Link** and **Open** buttons and the panel rows each open a new tab. Off, the dashboard buttons replace the dashboard in its own tab, and panel rows reuse the last main-area tab (a pinned tab always gets a new tab instead). Repeat on desktop, in mobile emulation and on a real phone and tablet; on a phone the right sidebar closes after a jump.
10. On a phone-width window the settings page stays usable and the rules box is full width.
