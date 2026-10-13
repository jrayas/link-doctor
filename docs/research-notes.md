# Research notes

Researched on 2026-10-13. Sources: Obsidian developer docs and `obsidian-developer-docs` repo, the `obsidian` npm typings (v1.14.4, read directly from `obsidian.d.ts`), the official sample plugin (master), npm registry, and the community plugin directory.

Items marked **(verify)** could not be confirmed from documentation alone and must be checked empirically against the fixture vault in Obsidian before we rely on them.

## 1. Official sample plugin (current)

- Layout: `src/main.ts`, `esbuild.config.mjs`, `eslint.config.mts`, `tsconfig.json`, `manifest.json`, `versions.json`, `version-bump.mjs`, `styles.css`, `AGENTS.md`, `.npmrc` (`tag-version-prefix=""`), `.editorconfig`, licence 0BSD.
- Scripts: `dev` (esbuild watch), `build` (`tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`), `version` (bumps manifest and `versions.json`), `lint` (`eslint .`).
- Dev dependencies: `eslint` ^9.39, `@eslint/js`, `typescript-eslint` ^8.59, `eslint-plugin-obsidianmd` ^0.4.0, `esbuild` 0.25.5, `typescript` ^5.8, `globals`, `jiti`, `obsidian: latest`, `@types/node`.
- `tsconfig`: `strict`, `noImplicitReturns`, `noUncheckedIndexedAccess`, target/lib ES2021 + DOM, `moduleResolution: node`.
- esbuild: bundle to a single CJS `main.js`, target `es2021`, externals `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` and **all Node builtins**. Inline sourcemaps in dev only; minify in production.
- Release workflow: on tag push (no `v` prefix) it runs `npm ci && npm run build`, attests provenance for `main.js`/`styles.css`, then `gh release create --draft` with `main.js manifest.json styles.css`. Lint workflow runs Node 20/22/24 on Ubuntu.
- Manifest fields: `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `authorUrl`, `fundingUrl`, `isDesktopOnly`.

## 2. Plugin guidelines (current)

- Use `this.app`, never the global `app`. Only log errors by default.
- Sentence case. Use `Setting.setHeading()`, not `<h1>/<h2>`. No top-level settings heading unless several sections; do not put "settings" in headings.
- No `innerHTML`/`outerHTML`/`insertAdjacentHTML` with user input; use DOM helpers (`createEl`, `createDiv`, `createSpan`) and `el.empty()`.
- Clean up with `registerEvent()` / `addCommand()`. Do not detach leaves in `onunload`.
- Vault: edit the active note with the Editor API (not `Vault.modify`); edit closed notes with `Vault.process()` (atomic); `FileManager.processFrontMatter` for frontmatter; prefer Vault over Adapter; use `getFileByPath` etc. rather than scanning; run constructed paths through `normalizePath()`.
- Commands: no default hotkeys; `callback` / `checkCallback` / `editorCallback`.
- Workspace: `getActiveViewOfType()`, not `workspace.activeLeaf`; do not keep references to custom views; fetch via `getLeavesOfType`.
- Styling: CSS classes in `styles.css`, Obsidian CSS variables, no hard-coded styles.
- Mobile: no Node/Electron APIs (else `isDesktopOnly: true`); regex lookbehind only works on iOS 16.4+, so **avoid lookbehind in all regexes**.

**Consequence for fixes:** if the note to be edited is the active, open note, apply the edit through the Editor API (preserves cursor and undo); otherwise `Vault.process()`. Our own undo stack must handle both.

## 3. Submission requirements

The `Submission requirements for plugins` page 404s at its old URL. Current process (from "Submit your plugin"):

- Repo root must contain `README.md`, `LICENSE`, `manifest.json`.
- Manifest `version` is `x.y.z`; the GitHub release tag must equal it exactly; assets `main.js` + `manifest.json` (+ optional `styles.css`).
- Manifest `id` must be unique and must not contain "obsidian". `manifest.json` at the HEAD of the default branch is what is validated.
- Submission is via community.obsidian.md (linking GitHub), followed by automated review; unresolved errors block installation.
- Canonical machine-readable rules: `obsidian-releases/.github/workflows/validate-plugin-entry.yml` (could not be fetched in this session; **re-check in Phase 9**).

## 4. API behaviour (from `obsidian.d.ts` 1.14.4)

| Topic | Finding |
|---|---|
| `metadataCache.resolvedLinks` / `unresolvedLinks` | `Record<sourcePath, Record<destPath-or-linkpath, count>>`. Paths are vault-absolute. Counts per source. Updated after files are indexed and *resolved*. |
| Events | `changed(file, data, cache)` fires when a file is indexed (not on rename). `deleted(file, prevCache)`. `resolve(file)` per file. `resolved()` fires once all files resolved, and again after later modifications. `Vault 'rename'` must be hooked for renames. |
| Per-file cache | `getFileCache(file)` / `getCache(path)` return `CachedMetadata` with `links`, `embeds`, `headings`, `blocks`, `sections`, `frontmatter`, `frontmatterLinks`, `referenceLinks`, `footnotes`, `tags`. |
| `links` vs `embeds` | `links`: `[[wikilink]]`, `[[wikilink\|alias]]`, `[alias](markdown-link)`. `embeds`: `![[wikilink]]`, `![alias](markdown-link)`. Each entry is a `ReferenceCache`: `link`, `original`, `displayText`, `position {start,end: {line,col,offset}}`. |
| Headings / blocks | `HeadingCache {heading, level, position}`; `BlockCache {id, position}`. Exposed helpers `stripHeading` / `stripHeadingForLink` describe Obsidian's own heading normalisation, which our matcher should mirror. |
| Link helpers | `getFirstLinkpathDest(linkpath, sourcePath)` -> `TFile \| null` (uses Obsidian's own resolution, so case and shortest-path rules come for free). `parseLinktext('a#b')` -> `{path:'a', subpath:'#b'}`. `getLinkpath('a#b')` -> `a`. `fileToLinktext(file, source, omitMd)` builds a shortest link. |
| Link generation | `fileManager.generateMarkdownLink(file, sourcePath, subpath?, alias?)` honours the user's link-format settings. We will use it only for *new* links; rewrites preserve the original style instead (see decisions). |
| Atomic edits | `vault.process(file, fn)` since 1.1.0 (returns the new content). `fileManager.processFrontMatter` since 1.4.4. |
| Lookups | `vault.getFileByPath`/`getFolderByPath` since 1.5.7. |
| Workspace | `revealLeaf` 1.7.2; `getLeavesOfType`, `getRightLeaf(split)`, `openLinkText(linktext, sourcePath, newLeaf?, openViewState?)`; `leaf.view.setEphemeralState({line})` moves the cursor to a line. |
| Platform | `Platform.isMobile`, `isMobileApp`, `isIosApp`, `isAndroidApp`, `isDesktop`. |
| Mobile emulation | Dev console: `this.app.emulateMobile(true)` / `(false)`; toggle with `!this.app.isMobile`. Real devices: Android via `chrome://inspect`; iOS 16.4+ via Safari Web Inspector on macOS. |

**(verify)** in the fixture vault, because the typings do not state it:
1. `unresolvedLinks` is keyed by *linkpath only*: missing headings/blocks on an existing note are **not** reported there, so those two types must come from our own check against `headings`/`blocks`.
2. Whether embeds of missing attachments appear in `unresolvedLinks`, and whether Markdown links to missing local files do. If not, we resolve them ourselves with `getFirstLinkpathDest` on decoded paths.
3. How `link` is stored for Markdown links (percent-encoding, `<…>` angle-bracket form, `.md` extension) and for links inside code blocks (the cache should skip them).
4. Whether `frontmatterLinks` should count as broken links (default: yes as a separate, toggleable source; decide after seeing real data).

## 5. Minimum app version

Highest `@since` among APIs we plan to use: `getFileByPath`/`getFolderByPath` 1.5.7, `revealLeaf` 1.7.2, `vault.process` 1.1.0, `setHeading` 1.1.0. **Proposed `minAppVersion`: `1.5.7`**; revisit if we adopt anything newer (e.g. `SettingGroup` is 1.11.0, so avoid it).

## 6. Linting

`eslint-plugin-obsidianmd` is current (**0.4.2**, used by the official sample, ~27 rules incl. sentence-case UI text, no `innerHTML`, no global `app`, platform and security checks). Adopt `obsidianmd.configs.recommended` exactly as in the sample.

- Peer dep note: it declares `eslint >= 9.19` and `typescript-eslint ^8`; ESLint 10 and TypeScript 7 are on npm now, but the sample pins ESLint ^9 and TypeScript ^5.8. **Stay on the sample's majors** (ESLint 9, TS 5.x) to avoid peer-dep breakage.
- Add our own Node/Electron ban on top (`no-restricted-imports` for `fs`, `path`, `os`, `child_process`, `electron`, `node:*`, `crypto`, `http(s)`, etc., plus `no-restricted-globals` for `require`, `process`, `Buffer`) and a post-build scanner test (section 4a).

## 7. Testing

- **Unit/integration: Vitest 5.0.4** (needs Node ^22.12 or >=24; we have 22.23). The `obsidian` npm package ships types only (`main: ""`), so tests cannot import it at runtime. Strategy: keep the engine pure (no `obsidian` import), and `vi.mock`/alias `obsidian` to a small hand-written stub (`tests/mocks/obsidian.ts`) for view and wiring tests. Use `jsdom` (30.x) only for the few DOM tests; Obsidian's `createEl`/`empty` helpers need a small shim.
- **End-to-end: `wdio-obsidian-service` 3.3.0** (with `wdio-obsidian-reporter`, `obsidian-launcher`, WebdriverIO 9). Current, actively maintained, supports Windows/macOS/Linux and Android, sandboxes each instance, loads a plugin and opens a vault, works in GitHub Actions. Cost: it downloads Obsidian + a matching Chromium (hundreds of MB) and adds WebdriverIO to devDependencies. **Recommendation:** include it as an *optional* `npm run test:e2e` (not part of `verify`) and run it in CI on Ubuntu only. **Needs the user's approval before installing** (heavy dependency).
- Manual checklist (`docs/manual-testing.md`) remains the source of truth for real devices; no tool can drive iOS.

## 8. Competition

| Plugin | What it does | Gaps |
|---|---|---|
| **Broken Links** (ipshing) | Finds internal links not connected to files, incl. heading/block links; file, folder and link views; edit the link or create the missing note. | No fuzzy suggestions, no preview/undo, no dashboard health summary. |
| **Find orphaned files and broken links** (vinzent03; ~206k downloads) | Orphans and broken links, with mass actions. | Orphan-centric; no heading/block precision or suggestions; basic UI. |
| **Vault Link Check** (Tomayachi) | Sorts broken links into near-misses (with suggested target) and planned notes. Read-only, offline. | Never edits, so no one-click fix, preview or undo. |
| **Link Integrity** | Read-only local diagnostic for broken links and isolated files. | Report only. |
| **Vault Inspector** (rogerdigital) | Broad linter: wikilinks, Markdown links, embeds, headings, orphan attachments, empty notes, duplicates. | Report only; broad rather than deep on fixing. |
| **Dangling Links** | Side-panel list of links pointing nowhere; folder exclusion. | Minimal; no fixes. |
| **Vault Plus** | Dashboard of orphans, broken links, duplicates; advertises one-click fixes. | Closed listing, could not verify fix behaviour. |
| **Random broken link / Note Batcher** | Open a random unresolved link / bulk-create unresolved notes (Dataview). | Narrow single-purpose tools. |

**Differentiators for this plugin:** the five precise link types in one place; fuzzy suggestions that account for aliases, headings and blocks; **preview, atomic apply and undo**; a live "current note" side panel *and* a dashboard; explicit mobile/touch-first and cross-platform design; architecture ready for further health checks.

## 9. Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | Start from the official sample's structure, scripts and esbuild config; keep npm, esbuild, TS ^5.8, ESLint ^9. | Matches submission tooling; avoids peer-dep issues. |
| D2 | Adopt `eslint-plugin-obsidianmd` ^0.4.2 `recommended` + custom Node/Electron import ban. | Current, official, enforces guidelines. |
| D3 | Vitest for unit and mocked-integration tests; pure `core/` has zero `obsidian` imports. | `obsidian` has no runtime; purity makes testing cheap. |
| D4 | `wdio-obsidian-service` as optional e2e, outside `verify`, pending user approval. | Reliable and current, but heavy. |
| D5 | `minAppVersion` 1.5.7, `isDesktopOnly: false`. | Highest `@since` of planned APIs. |
| D6 | Types 1, 4, 5 via `unresolvedLinks`/own resolution; types 2, 3 via `headings`/`blocks`; resolve with `getFirstLinkpathDest` so case/path rules match Obsidian. **(verify list above)** | Prefer cache over file reads. |
| D7 | Ignore rules: glob patterns (folder prefix + `*`/`**`), no user-supplied regex in MVP. | Safer (no ReDoS), simpler on mobile; regex also risks lookbehind on old iOS. |
| D8 | Edits: Editor API for the active note, `vault.process` otherwise; own in-memory undo stack storing exact before/after text spans with a staleness check. | Guidelines + atomicity; undo must refuse if the text has since changed. |
| D9 | Rewrites preserve original link style rather than calling `generateMarkdownLink`. | Spec requires preserving alias/heading/block/style. |
| D10 | No regex lookbehind; no Node builtins; scan `main.js` in tests. | iOS < 16.4 and mobile safety. |
| D11 | Fuzzy matching: own small scorer (normalised NFC + case-folded, trigram/Levenshtein blend) in pure code, not `prepareFuzzySearch`. | `prepareFuzzySearch` is not available to pure/unit-tested code and gives no calibrated confidence. |
| D12 | Line numbers from the cache's `position.start.line`; context snippet read lazily from the file only for visible rows. | Avoids reading every file. |

## 10. Performance (to be filled in during Phase 8)

Target (proposed): first full scan of a 5,000-note / ~50,000-link synthetic vault under 1 s of pure-engine time on desktop and under 3 s on a mid-range phone equivalent, in chunks of ≤ 8 ms per frame; incremental update for a single edited note under 10 ms.

| Date | Notes | Links | Scan time | Machine |
|---|---|---|---|---|
| — | — | — | pending | — |
