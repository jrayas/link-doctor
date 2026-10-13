# Plan: Link Doctor

Working plugin id `link-doctor`, name "Link Doctor" (placeholders; see research-notes D-list for rationale). British English throughout.

## 1. Architecture

Three layers, dependencies pointing downwards only.

```
ui/         Obsidian views, modals, settings tab (imports obsidian)
adapters/   Thin wrappers over the Obsidian API (imports obsidian)
core/       Pure TypeScript, NO obsidian import, fully unit-tested
```

- **core** works on plain data: `NoteSnapshot { path, links[], embeds[], headings[], blocks[], aliases[] }` and a `VaultIndex` (path -> snapshot, plus a name index). It decides broken/healthy, suggests fixes, rewrites link text, and aggregates statistics. Resolution rules (case, shortest-path, extension, NFC/NFD) are implemented once in `core/resolve.ts` and cross-checked against Obsidian's `getFirstLinkpathDest` in the fixture-vault checks.
- **adapters** convert `MetadataCache`/`Vault` data into snapshots, apply edits, and emit change events.
- **ui** renders results and calls services; no business logic.

### Health-check seam
`core/checks/` holds `HealthCheck { id, label, run(index, settings): Finding[] }`. Broken links is the first check; orphans, unused attachments, duplicates, empty notes and trends become further checks without touching the UI shell.

## 2. File layout

```
src/
  main.ts                    plugin lifecycle only
  settings.ts                typed settings, defaults, validate(), migrate()
  core/
    types.ts                 LinkKind, BrokenLink, Finding, NoteSnapshot
    text.ts                  NFC normalise, case-fold, line splitting (LF/CRLF), sanitiseFilename
    resolve.ts               linkpath resolution, heading/block resolution
    detect.ts                broken-link detection (5 types)
    fuzzy.ts                 candidate scoring and ranking
    suggest.ts               suggestions per link type (notes, aliases, headings, blocks)
    rewrite.ts               link rewriting (alias/heading/block/style preserved, EOL untouched)
    ignore.ts                glob matching
    stats.ts                 health summary, grouping, sorting, filtering
    checks/                  HealthCheck interface + brokenLinks check
  adapters/
    snapshot.ts              metadataCache -> NoteSnapshot (incremental)
    index-service.ts         owns VaultIndex; chunked first scan; debounced updates; events
    editor.ts                apply/undo edits (Editor API for open note, vault.process otherwise)
    undo-stack.ts            session undo
    create-note.ts           missing-note creation with sanitising and warnings
  ui/
    panel-view.ts            ItemView (right sidebar)
    dashboard-view.ts        ItemView (main area)
    preview-modal.ts         before/after preview + confirm
    components/              row, badge, empty state, summary
    settings-tab.ts
styles.css
tests/                       unit/, integration/, mocks/obsidian.ts, fixtures
test-vault/                  fixture vault + README with expected counts
scripts/                     check-forbidden.mjs, gen-synthetic-vault.mjs, bench.mjs
docs/                        research-notes.md, plan.md, manual-testing.md
.github/workflows/           verify.yml (macOS/Windows/Ubuntu), release.yml
```

## 3. Key design points

- **Detection.** Per note: for each `links`/`embeds` entry, `parseLinktext` equivalent splits path/subpath. Missing path -> type 1 (link) or 4 (embed). Existing target with missing `#heading`/`#^block` -> 2/3 (only checked against the target's cached headings/blocks, matched with Obsidian-style heading normalisation). Markdown-style (`[x](path)`) is decoded (percent-encoding, angle brackets), external schemes are skipped, then resolved as local files -> type 5.
- **Incremental.** `index-service` keeps `VaultIndex`; on `metadataCache.changed` it re-snapshots that one file; on `deleted`/`rename` it updates affected entries and invalidates only notes whose links resolved to the changed path (reverse index). Never a full rescan after the first scan. First scan runs in chunks (time-budgeted, yielding via `requestAnimationFrame`/`setTimeout`), reports progress, and is cancellable.
- **Panel.** Subscribes to `active-leaf-change`/`file-open` and index updates, debounced (setting). Jump uses line/col from the cache position and moves the cursor via `setEphemeralState({ line })` plus selection. CRLF is irrelevant to cached line numbers but covered in tests for any text-derived offsets.
- **Fixes.** Flow: build `FixPlan` (pure) -> preview modal (before/after, scrollable, large buttons) -> apply -> push `UndoEntry { path, before, after, range }`. Undo verifies the span still equals `after`; if not, it tells the user instead of overwriting. Create-missing-note never overwrites an existing file and warns when the name had to be sanitised or truncated.
- **Mobile.** Single-column card layout under ~600 px container width via container queries; 44 px targets; no hover-only controls; `Platform` used only for documented behavioural differences (none expected at the start).
- **Settings.** Typed `LinkDoctorSettings` + `settingsVersion`; `validate(raw: unknown)` coerces field by field to defaults.

## 4. Phases and deliverables

| # | Phase | Output | Exit gate |
|---|---|---|---|
| 1 | Research and plan | notes, this plan, decisions | user approves plan |
| 2 | Scaffold | sample-based project, strict TS, ESLint, Vitest, `verify`, CI skeleton, fixture vault skeleton | `npm run verify` green |
| 3 | Core engine | `src/core/*` + unit tests (incl. cross-platform cases) | tests green, fixture counts match |
| 4 | Side panel | panel, toggle, jump, live updates, empty states | manual check in Obsidian + mobile emulation |
| 5 | Fixes | suggestions, preview modal, apply, undo | tests + manual |
| 6 | Dashboard | summary, table/cards, search, filters, grouping | manual incl. phone width |
| 7 | Settings | tab, validation, reset | unit tests |
| 8 | Hardening | benchmark, forbidden-API scan, a11y, unload leak check, optional e2e | numbers recorded |
| 9 | Release readiness | README, manifest, versions.json, LICENSE, release workflow, submission checklist | checklist complete |

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Cache behaviour differs from assumption (see research **(verify)** list) | Phase 3 starts by exercising the fixture vault in real Obsidian and recording results; core takes snapshots so only the adapter changes. |
| Our resolver disagrees with Obsidian's | Treat `getFirstLinkpathDest` as ground truth in the adapter; keep `core/resolve.ts` for index-only work and add a dev command comparing both across the fixture vault. |
| Large vaults freeze mobile | Time-budgeted chunking, reverse index, lazy snippets, benchmark gate in Phase 8. |
| Edits to a note being typed in | Editor API for the active note, stale-span check on undo, `vault.process` for others. |
| Regex lookbehind on iOS < 16.4 | Lint/test ban on `(?<=`/`(?<!`. |
| Plugin directory rules change | Re-read validation workflow in Phase 9. |
| E2E tool weight | Optional script, user approval first. |

## 6. Open points needing the user

- Approve this plan and the D1-D12 decisions.
- Approve installing dev dependencies in Phase 2: `typescript`, `esbuild`, `eslint` + `typescript-eslint` + `@eslint/js` + `eslint-plugin-obsidianmd` + `globals` + `jiti`, `obsidian`, `@types/node`, `vitest`, `jsdom`. (Optional later: `wdio-obsidian-service` family, `@vitest/coverage-v8`.)
- Confirm the final plugin name, id and author details before Phase 9.
