import { MarkdownView, Notice, Platform, type App } from 'obsidian';
import type { BrokenLink } from '../core/types';

/** Opens the note and puts the cursor on the link. Falls back to just opening the note. */
export async function jumpToLink(app: App, link: BrokenLink, inNewTab = false): Promise<void> {
	const file = app.vault.getFileByPath(link.sourcePath);
	if (!file) {
		new Notice('That note no longer exists.');
		return;
	}
	const from = { line: link.start.line, ch: link.start.col };
	const to = { line: link.end.line, ch: link.end.col };
	// The caller decides (from the "Open notes in a new tab" setting) whether to reuse the current tab.
	// 'tab' always makes a new tab. `false` is the tab the user is in: Obsidian's own "open here" choice.
	const leaf = app.workspace.getLeaf(inNewTab ? 'tab' : false);
	// TEMPORARY DIAGNOSTIC: remove once the tab behaviour is confirmed.
	new Notice(`new tab setting: ${String(inNewTab)}; target view before opening: ${leaf.view.getViewType()}`, 6000);
	await leaf.openFile(file, { active: true, eState: { line: from.line, cursor: { from, to } } });
	await app.workspace.revealLeaf(leaf);
	const view = leaf.view;
	if (view instanceof MarkdownView && view.getMode() === 'source') {
		try {
			view.editor.setSelection(from, to);
			view.editor.scrollIntoView({ from, to }, true);
			view.editor.focus();
		} catch {
			// The note may have changed since the scan; opening it is still useful.
		}
	}
	// On a phone the sidebar covers the note, so close it once we have jumped.
	if (Platform.isPhone) app.workspace.rightSplit.collapse();
}
