import { MarkdownView, Notice, Platform, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import type { BrokenLink } from '../core/types';

function findOpenLeaf(app: App, file: TFile): WorkspaceLeaf | null {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) return leaf;
	}
	return null;
}

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
	// A new tab is always a new tab; otherwise reuse a tab that already shows the note.
	const leaf = inNewTab ? app.workspace.getLeaf('tab') : (findOpenLeaf(app, file) ?? app.workspace.getLeaf(false));
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
