# Project: Obsidian Link Doctor (working name)

An Obsidian plugin that finds and explains broken links, and shows where they are. Build it end to end in this repository: research, implementation, tests and release readiness.

> **Brief updated 2026-10-14 (decision D13 in `docs/research-notes.md`).** The original brief also asked for fix suggestions (preview, apply, undo). At the developer's request fixing was removed: the plugin is a **read-only finder** that never edits notes, shipped as 0.1.1. The fix engine is in git history (tag `0.1.0`). Fixing and bulk fix are now under future ideas. Two features were added: an empty notes list, and a setting to open notes in a new tab or the current tab. Sections below describe the product as built.

Use **British English** in all UI text, docs, comments and commit messages.

**Platform target: every device Obsidian runs on.** The developer builds and tests on **macOS**, but the plugin must work identically on **macOS, Windows, Linux, iOS/iPadOS and Android** (see section 4a). Never assume Mac behaviour. Dev scripts should also run on Windows and Linux (use Node scripts, not bash-only commands).

---

## 0. Ground rules

1. **Research before coding. Do not rely on memory** for Obsidian APIs, guidelines or tooling versions. They change. Fetch the current official sources below and note what you find in `docs/research-notes.md`.
2. **Plan first.** After research, write `docs/plan.md` (architecture, file layout, phases, risks) and show a short summary before implementing.
3. **Work in phases** (section 6). Commit after each phase with tests passing. Never leave the build broken.
4. **Ask before** adding heavy dependencies, changing scope, or doing anything destructive.
5. **Never modify user notes.** The plugin is read-only; if editing is ever added it must come with a preview and an undo path (see section 4).

---

## 1. Research tasks (do these first)

Fetch and read the current versions of:

- Obsidian developer docs: https://docs.obsidian.md (Plugins section: getting started, `Plugin`, `ItemView`, `Workspace`, `MetadataCache`, `Vault`, `Modal`, settings, mobile development)
- Official sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin (copy its current structure, build config and scripts)
- Plugin guidelines and submission requirements: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
- Current ESLint plugin for Obsidian (search for `eslint-plugin-obsidianmd`) and adopt it if it is current
- Current test tooling: check what the community uses for testing Obsidian plugins (Vitest, mocking the `obsidian` module, `wdio-obsidian-service` for end-to-end). Recommend and justify a choice.
- Competition: search the community plugin directory (https://obsidian.md/plugins) and GitHub for existing broken link, unresolved link and orphan note plugins. Summarise what they do, what they lack, and how this plugin differs. Record in `docs/research-notes.md`.
- Core behaviour to verify, not assume:
  - `app.metadataCache.unresolvedLinks` and `resolvedLinks` shape and when they update
  - How to detect broken **heading** and **block** links (`[[Note#Heading]]`, `[[Note#^id]]`) using `getFileCache().headings` and `.blocks`
  - How embeds and Markdown-style links appear in the cache (`links`, `embeds`)
  - `getFirstLinkpathDest`, `parseLinktext`, `getLinkpath`
  - `app.fileManager.processFrontMatter`, `app.vault.process` (atomic edits), `app.fileManager.generateMarkdownLink`
  - Events: `metadataCache.on('changed' | 'resolved' | 'deleted')`, `vault.on('rename')`, `workspace.on('active-leaf-change' | 'file-open')`
  - Current minimum app version and the right `minAppVersion` for the APIs used

Deliver a short list of **decisions** from the research (e.g. test stack, lint setup, API choices) before building.

---

## 2. MVP scope

### A. Side panel (custom `ItemView`)
- Opens in the right sidebar via ribbon icon and command.
- Shows broken links for the **active note** and updates when the user switches note or edits it (debounced).
- Top toggle: **Current** (default) | **All**. Persist the last choice only if the setting allows.
- Each broken link row shows: the type (semi-bold), the line number and the link text. In **All** mode the source note path is shown too. There is no context snippet (it repeated the link text).
- In **All** mode, notes that are empty apart from frontmatter are listed below the broken links.
- **Click jumps** to the exact line and position in the source note.
- Empty state when there are no broken links (friendly message, not a blank panel).
- Handles no active note, non-Markdown files and unsaved states gracefully.

### B. Broken link detection
Detect and label these types:
1. Wikilink to a missing note
2. Wikilink to a missing heading
3. Wikilink to a missing block ID
4. Embed to a missing file (notes or attachments)
5. Standard Markdown link to a missing local file

Out of scope for MVP: external URL checking.

Detection logic must be **pure and separable** from the Obsidian API so it can be unit tested. Prefer the metadata cache over reading and parsing every file. Update incrementally on changes; never rescan the whole vault on every keystroke.

### C. Fix suggestions (removed)
Not part of the product. The plugin lists broken links and jumps to them; it does not suggest, apply or undo fixes. The panel and dashboard have no fix buttons, and there are no settings or commands for fixing. This was the developer's decision (D13). To bring it back, start from git tag `0.1.0` and keep the original rules: closest-match suggestions with a confidence indicator, previewed before/after, applied atomically with `vault.process` (or the Editor API for the open note), undoable, preserving alias, heading, block and link style.

### D. Dashboard (full view)
Opens as a main-area view via command and button in the panel.
- Vault health summary: total notes, total links, broken link count, percentage healthy, breakdown by broken type.
- Table of broken links: source note (group heading), link, type, line, and a **Link** button that opens the note at the link. Columns line up across groups, and long type names are shortened (hover for the full name).
- **Search** across files and broken links (instant filter).
- Filters: type, folder; sort by count or name; group by source note.
- Per-note view of broken link counts (worst offenders first).
- **Empty notes** section (notes with only frontmatter or blank lines), open by default, with an **Open** button per note.
- **Link** and **Open** follow the setting for a new tab or the current tab.
- Respect ignore rules from settings.

Keep orphan notes, unused attachments, duplicates and trends **out of the MVP** but structure the code so they can be added as extra "health checks" later.

---

## 3. Settings (`PluginSettingTab`)

Research current best practice for settings UI, then implement:
- Default panel mode (Current / All)
- Ignored folders and ignore patterns (glob only, decided in research: simple, safe and mobile-friendly)
- Which link types to check (toggle each)
- Auto-refresh on/off and debounce delay
- Open notes in a new tab, or reuse the current tab
- Reset to defaults

Validate settings on load (missing or malformed data must fall back to defaults). Use a typed settings interface and a migration-friendly `settingsVersion`.

---

## 4. Safety and quality requirements

- **No edits.** The plugin never writes to a note. (If editing is ever added: preview, then apply, with undo.)
- Never block the UI thread on large vaults. Chunk or defer work; show progress for first scan.
- **Cross-platform is mandatory**: see section 4a. `isDesktopOnly` must be `false`.
- Clean up everything on unload (views, event listeners via `registerEvent`, timers via `registerInterval`).
- Follow Obsidian plugin guidelines: sentence case in UI text, no `innerHTML` with user content, no unnecessary global state, use `this.app` rather than the global `app`, no deleting or overwriting files without consent.
- Accessibility: keyboard navigable lists, sensible `aria-label`s, respects themes via Obsidian CSS variables only (no hard-coded colours).
- No network calls, no telemetry.

---

## 4a. Cross-platform requirements (macOS, Windows, Linux, iOS, Android)

Research the current official guidance on mobile development and platform differences, then enforce the following.

**APIs**
- Use **only the Obsidian API and standard web APIs**. No Node.js or Electron modules (`fs`, `path`, `os`, `child_process`, `electron`, `require`) anywhere in the plugin runtime. They do not exist on mobile.
- Use `normalizePath` and Obsidian's vault/adapter APIs for all paths. Never hand-build paths with `\` or `/`.
- Use Obsidian's `Platform` helpers (e.g. `Platform.isMobile`, `Platform.isDesktop`) only where behaviour genuinely must differ, and document each use.
- Avoid APIs that are not available or behave differently on mobile (clipboard, drag and drop, file pickers, `window.open`). Verify each against the docs before use.
- Add a lint rule or test that fails the build if a Node/Electron import appears.

**File system and text behaviour (the usual hidden bugs)**
- **Case sensitivity**: macOS and Windows are usually case-insensitive, Linux and Android are case-sensitive. Link resolution must follow Obsidian's own resolution rules, not assume either behaviour.
- **Unicode normalisation**: macOS file systems can store names in NFD while users type NFC (accents, e.g. `é`). Compare names with normalisation so a link is not falsely reported as broken. Test with accented, CJK, emoji and RTL names.
- **Line endings**: handle both `\n` and `\r\n` when computing line numbers, and jumping to lines.
- **Vault location**: do not assume iCloud, OneDrive, Dropbox or Sync folder behaviour. Handle files appearing, disappearing or being mid-sync without errors.

**UI and interaction**
- **Touch first, mouse second**: every action must work by tap alone. No hover-only controls, no right-click-only actions, no keyboard-shortcut-only features. Touch targets at least 44 px.
- Responsive layout from roughly 320 px wide upwards: the panel on a phone sidebar, the dashboard on a tablet and a desktop pane. Tables must collapse to a card or list layout on narrow screens.
- Respect safe areas, light and dark themes, and user font size; use Obsidian CSS variables only.
- Keep keyboard accessibility on desktop and screen reader labels on all platforms.
- Test the dashboard and settings page on a small screen (scrolls, buttons reachable, no clipped content).

**Performance and memory on mobile**
- Assume a low-memory phone and a large vault. Work incrementally, avoid holding the full vault content in memory, and never read every file's contents when the metadata cache is enough.
- Keep the first scan cancellable and non-blocking; avoid long synchronous loops (chunk with `requestAnimationFrame` or idle callbacks).
- Be conservative with background work to protect battery.

---

## 5. Testing layer

Set up testing as part of the build, not an afterthought.

1. **Unit tests** (Vitest unless research recommends otherwise) for all pure logic:
   - Link classification and broken-link detection (all five types)
   - Heading and block resolution, including nested headings, duplicate headings and special characters
   - Aliases, relative paths, folders with spaces, case sensitivity, and non-ASCII names
   - Empty note detection (frontmatter ignored)
   - Ignore rule matching
   - Settings validation and defaults
   - Cross-platform edge cases: NFC vs NFD names, `\r\n` vs `\n` line numbers, case differences, Windows-forbidden characters, very long names, backslash vs forward slash input
2. **Integration tests** with a mocked `obsidian` module for the view and event wiring where practical.
3. **Fixture vault** at `test-vault/` with deliberately broken links covering every type and edge case, plus healthy links, so manual and automated checks share one source of truth. Include a README listing the expected broken link count per note.
4. **End-to-end** (only if research finds a reliable, current approach such as `wdio-obsidian-service`): open the fixture vault, load the plugin, assert the panel output. If it is too fragile, document why and provide a manual test checklist in `docs/manual-testing.md` instead.
5. **Quality gates** wired into `package.json` scripts:
   - `npm run build`, `npm run test`, `npm run lint`, `npm run typecheck`
   - A single `npm run verify` that runs all of them
6. **CI**: GitHub Actions workflow running `verify` on **macOS, Windows and Ubuntu** runners. Add a release workflow producing `main.js`, `manifest.json` and `styles.css` per current release requirements.
7. **Mobile and device testing**:
   - Research how to emulate mobile in desktop Obsidian (e.g. the developer console `app.emulateMobile(true)`) and document the exact steps in `docs/manual-testing.md`.
   - Provide a manual checklist for **real devices** (iPhone, iPad, Android phone and tablet) covering: open panel, switch notes, Current/All toggle, jump to line, open in new tab or this tab, empty notes list, dashboard search and filters, rotate screen, dark and light themes.
   - Include a fixture note with CRLF line endings, NFD-named files and accented, CJK and emoji names.
   - Automated test that scans the built `main.js` and source for forbidden Node/Electron imports.
8. **Performance check**: a script that generates a synthetic vault (e.g. 5,000 notes with random links) and measures scan time. Record the numbers in `docs/research-notes.md` and set a sensible target.

---

## 6. Phases

1. **Research and plan**: `docs/research-notes.md`, `docs/plan.md`, decisions summary.
2. **Scaffold**: based on the current official sample plugin; TypeScript strict mode, lint, test runner, `verify` script, CI skeleton, fixture vault.
3. **Core engine** (pure logic) with unit tests passing.
4. **Side panel** with Current/All toggle, jump to line, live updates.
5. **Fix suggestions**, preview, apply and undo. (Built, then removed in 0.1.1; see D13.)
6. **Dashboard** with search, filters and health summary.
7. **Settings tab** and validation.
8. **Hardening**: large-vault performance, cross-platform checks (section 4a: Node/Electron import scan, NFC/NFD, CRLF, case sensitivity), mobile emulation and touch-only pass, accessibility, unload cleanup. Also check mobile layout early in phases 4 and 6, not only here.
9. **Release readiness**: README (British English, with usage and limitations), `manifest.json`, `versions.json`, LICENSE, release workflow, submission checklist against the current official requirements.

At the end of each phase: run `npm run verify`, summarise what was done, list known gaps, then continue.

---

## 7. Definition of done

- All five link types detected correctly against the fixture vault (counts match the fixture README).
- Panel follows the active note and the Current/All toggle works.
- The plugin never edits notes (read-only by design).
- Dashboard search and filters work; ignore rules respected.
- `npm run verify` passes locally and in CI on macOS, Windows and Ubuntu.
- No Node/Electron APIs in the built plugin (enforced by an automated check); `isDesktopOnly` is `false`.
- Verified in mobile emulation, with the real-device checklist completed on at least one iOS and one Android device (or clearly flagged as pending for the developer to run).
- Touch-only operation works for every feature; the dashboard is usable on a phone-width screen.
- Plugin loads and unloads cleanly with no leaked listeners.
- Passes the current Obsidian plugin guidelines and submission requirements checklist.
- Documentation exists: README, `docs/research-notes.md`, `docs/plan.md`, `docs/manual-testing.md`.

---

## 8. Future ideas (do not build now, keep the architecture ready)

Fix suggestions with preview, apply and undo (see section 2C), orphan notes, unused attachments, duplicate note names, health score trend over time, bulk fix with preview, export report to Markdown or CSV, opt-in external URL checking.
