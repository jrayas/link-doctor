# Release and submission checklist

Checked against the current Obsidian developer docs on 2026-10-14 (Submit your plugin, Manifest reference, Plugin guidelines) and `obsidianmd/obsidian-releases`. The old "Submission requirements" page has moved and the docs no longer list individual automated checks, so re-read the pages above just before submitting.

## Repository files

- [x] `README.md` describes purpose, usage, settings, limitations and privacy.
- [x] `LICENSE` is MIT, copyright Anthirayas (the GitHub profile name).
- [x] `manifest.json` is at the repository root.

## Manifest rules

| Rule | Status |
|---|---|
| `id` has only lowercase letters and hyphens, no `obsidian`, does not end in `plugin` | `link-doctor`: ok |
| `id` unique among published plugins | Not in `community-plugins.json` (8,883 entries) on 2026-10-14: ok |
| `name` is Basic Latin, no "Obsidian", no "Plugin", unique | `Link Doctor`: ok, unique on 2026-10-14. A similarly named "Note Doctor" exists; the names differ. |
| `version` is `x.y.z` | `0.1.0`: ok |
| `minAppVersion` is set and truthful | `1.13.0` from 0.1.2 (declarative settings API); older versions map to `1.7.2` in `versions.json`. Lint rule `no-unsupported-api` enforces it. |
| `isDesktopOnly` is `false` and no Node or Electron API is used | `check:bundle` scans the built `main.js` on every `verify` run |
| `author` is set | `Anthirayas`, with `authorUrl` https://github.com/jrayas. Optionally add `fundingUrl`. |
| `description` is accurate | Reviewed after the UI dropped its fix buttons |
| `versions.json` maps each version to its `minAppVersion` | `0.1.0` and `0.1.1` to `1.7.2`, `0.1.2` to `1.13.0` |

## Guidelines check (Plugin guidelines page)

- [x] No global `app`; `this.app` is used.
- [x] No `innerHTML`, `outerHTML` or `insertAdjacentHTML` (the DOM helpers and `empty()` are used).
- [x] Events go through `registerEvent`; no global listeners or intervals (`tests/unit/lifecycle.test.ts`); no leaves detached in `onunload`.
- [x] Sentence case in the UI; settings headings are not titled "settings" and use `setHeading()`.
- [x] No default hotkeys; commands use `callback`.
- [x] No inline styles from code except `setCssProps` for one CSS variable; colours come from Obsidian variables.
- [x] Notes are edited with the Editor API when open and `Vault.process` otherwise; paths pass through `normalizePath`.
- [x] No console logging in `src`.
- [x] No network access and no telemetry.

## Before the first release

1. Create the GitHub repository under the `jrayas` account and push (`git remote` is empty).
2. Run `npm run verify` on macOS, Windows and Ubuntu (the `verify` workflow does this on push).
3. Run the real-device checklist in `docs/manual-testing.md` on at least one iOS and one Android device, and record the results.
4. ~~Decide about fixing.~~ Done: 0.1.1 is a read-only finder; the fix engine and its two settings were removed.
5. Bump the version with `npm version <x.y.z>` (this updates `manifest.json` and `versions.json`), commit, then tag with exactly that version, no `v` prefix: `git tag 0.1.0 && git push --tags`.
6. The release workflow builds, checks the tag equals the manifest version, attests `main.js` and `styles.css`, and creates a **draft** release with `main.js`, `manifest.json` and `styles.css`. Review and publish the draft.
7. Sign in at community.obsidian.md, link your GitHub account and add the plugin. The directory reads `manifest.json` from the default branch, so commit the final version first.
8. If review reports errors, fix them, bump the version and release again.

## After release

- Announce it in the Obsidian forum showcase and Discord `#updates` if you wish; BRAT is a good way to give beta testers a build before listing.
