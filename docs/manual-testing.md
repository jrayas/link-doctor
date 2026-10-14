# Manual testing

Checks per phase, then the Phase 8 mobile and cross-platform section at the end.

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

## Phase 6: dashboard

Open the dashboard with the toolbar button in the side panel, or the command **Open dashboard**. The dashboard and panel only list and jump. The plugin never edits notes (the fix engine was removed in 0.1.1), so there is no preview, apply or undo to test.

1. The summary shows notes, links, broken count and healthy percentage, a bar, the notes with the most broken links, and one chip per link type with its count.
2. **Search**: type `healthy` and the list filters as you type. Click a chip to filter by type (click again to clear). Pick a folder. Change **Sort by**. Toggle **Grouped by note**. Tap a note under "Notes with the most broken links" to filter to it. "Nothing matches" offers **Clear filters**.
3. Every group's Type, Line and Actions columns line up, and "N broken" sits under the Actions column. A long type such as the Markdown target shows as **Missing target** with the full name on hover.
4. **Link** opens the note with the link selected (new tab or this tab: see the setting under Phase 7).
5. **Empty notes (N)** is open by default and lists notes with only frontmatter or blank lines; **Open** lines up with the **Link** buttons. In the panel's **All** mode the same notes are listed under the broken links.
6. Phone width (see Phase 8): the table becomes cards and buttons are at least 44 px tall.

## Phase 7: settings

Open Settings, then Link Doctor (needs Obsidian 1.13 or later). Also type a few of the option names, such as "refresh delay", into Obsidian's settings search: they should be found. The refresh delay slider shows its value next to it, and the Reset button is red.

1. Add `Templates/` under **Ignored folders and patterns**: after about a second the dashboard total drops from 23 to 21 and `Templates/Template.md` disappears. A line such as `^Archive/.*$` shows a note that regular expressions are not supported.
2. Switch off **Missing embed** under **Link types to check**: embeds vanish from the panel and dashboard. Switch it back on.
3. Set **Default panel mode** to All, close and reopen the panel: it opens in All. Turn on **Remember last panel mode**, switch to Current, reload: it starts in Current.
4. Turn off **Refresh automatically**: the refresh delay slider greys out and edits no longer update results until you press the rescan button. Turn it back on: a rescan runs.
5. Change **Refresh delay** to 3000: results update about three seconds after an edit.
6. **Reset to defaults** asks for confirmation, then restores everything, including the ignore rules.
7. Edit `data.json` in the plugin folder to something broken, for example `{"fuzzyThreshold": "high", "ignoreRules": 5}`, and reload: the plugin loads with defaults for those fields and no errors in the console.
8. **Open notes in a new tab**: on, the dashboard **Link** and **Open** buttons and the panel rows each open a new tab. Off, the dashboard buttons replace the dashboard in its own tab, and panel rows reuse the last main-area tab (a pinned tab always gets a new tab instead). Repeat on desktop, in mobile emulation and on a real phone and tablet; on a phone the right sidebar closes after a jump.
9. On a phone-width window the settings page stays usable and the rules box is full width.

## Phase 8: mobile emulation (desktop, nothing to install)

1. Open `test-vault/` in Obsidian on a desktop and open the developer console (`Cmd+Option+I` on macOS, `Ctrl+Shift+I` on Windows and Linux).
2. Run `this.app.emulateMobile(true)` and reload the app. Obsidian now uses its phone layout (`body.is-mobile`). Run `this.app.emulateMobile(false)` and reload to go back.
3. Narrow the window to about 320 to 400 px wide to mimic a phone, then widen it to about 800 px for a tablet.
4. Run the checklist below. Emulation is not a real iOS or Android engine, so it does not replace the real-device pass.

## Phase 8: checklist (emulation and real devices)

Use `test-vault/`. On a real device, copy the vault and the plugin folder (`.obsidian/plugins/link-doctor` with `main.js`, `manifest.json`, `styles.css`) across, for example with iCloud Drive and Files on iOS, or a USB copy on Android, then enable the plugin.

| # | Check | iPhone | iPad | Android phone | Android tablet |
|---|---|---|---|---|---|
| 1 | Open the panel from the ribbon or the command palette; it is readable and rows are easy to tap | | | | |
| 2 | Open `Broken/Missing notes.md`; Current shows 3 rows; switch to another note and the panel follows | | | | |
| 3 | Current / All toggle works by tap; the control is easy to hit | | | | |
| 4 | Tap a row: the note opens with the link selected; on a phone the sidebar closes | | | | |
| 5 | Open the dashboard from the panel; search, chips, folder, sort and grouping all work by tap | | | | |
| 6 | Dashboard layout: table or cards, no sideways scrolling, buttons at least 44 px | | | | |
| 7 | **Link** opens the note; the **Open notes in a new tab** setting switches between a new tab and this tab | | | | |
| 8 | Empty notes list shows `joan`-style notes and **Open** works | | | | |
| 9 | Settings page is usable; the ignore rules box is full width; Reset asks first | | | | |
| 10 | `Edge/crlf-note.md` rows report lines 5 and 6 | | | | |
| 11 | `Edge/Unicode.md`: accented, CJK and emoji names are handled; NFD file names are not falsely reported (on the desktop run `node scripts/make-nfd-fixture.mjs` first to create the NFD-named file, then copy the vault) | | | | |
| 12 | Rotate the screen: panel and dashboard re-flow without losing state | | | | |
| 13 | Switch between light and dark themes and a large user font size: text stays legible, nothing clips | | | | |
| 14 | Keep the app open while editing a note elsewhere (or let sync run): no errors, no freeze | | | | |
| 15 | Turn the plugin off and on: panels and dashboard close cleanly; no console errors | | | | |

## Phase 8: keyboard and screen reader (desktop)

1. Tab through the panel: toggle, rescan, dashboard button, then each row. Enter or Space on a row jumps; the arrow keys move between rows.
2. Tab through the dashboard: header buttons, search, chips (state announced as pressed), folder, sort, group toggle, each **Link** button, and the **Empty notes** summary (Enter opens or closes it).
3. With VoiceOver (macOS) or NVDA (Windows): rows announce "type: link, note, line N. Go to link"; the status line is announced when scanning finishes; the type badge reads its full name.

## Phase 8: performance and cleanup (developer, any platform)

- `npm run bench` prints scan time, slice length, single-edit time and memory for a synthetic 5,000-note vault. Results are recorded in `docs/research-notes.md` section 10.
- The automated `tests/unit/lifecycle.test.ts` fails if any Obsidian event is registered outside `registerEvent`, or a global listener, interval or stray timer appears.
- `npm run check:bundle` scans the built `main.js` for Node and Electron APIs and regex lookbehind.
