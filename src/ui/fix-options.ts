import { canCreateNote } from '../core/fix';
import type { BrokenLink } from '../core/types';
import type { FixService } from '../adapters/fix-service';

const CONFIDENCE_LABEL = { high: 'High match', medium: 'Medium match', low: 'Low match' } as const;

/**
 * Renders the fix choices for one broken link: the best suggestions, create note and remove link.
 * Every choice is a real button, so it works by tap, click and keyboard alike.
 * Suggestions are computed here, on demand, not when the list is drawn.
 */
export function renderFixOptions(container: HTMLElement, link: BrokenLink, fixes: FixService): void {
	container.empty();
	const suggestions = fixes.suggestions(link);
	if (suggestions.length === 0) {
		container.createDiv({ cls: 'link-doctor-fix-none', text: 'No close match found.' });
	}
	for (const s of suggestions) {
		const button = container.createEl('button', {
			cls: 'link-doctor-fix-button',
			attr: { 'aria-label': `Use ${s.label}. ${CONFIDENCE_LABEL[s.confidence]}.` },
		});
		button.createSpan({ cls: 'link-doctor-fix-label', text: `Use ${s.label}` });
		button.createSpan({ cls: `link-doctor-confidence is-${s.confidence}`, text: CONFIDENCE_LABEL[s.confidence] });
		button.addEventListener('click', () => void fixes.run(link, { kind: 'apply', suggestion: s }));
	}
	if (canCreateNote(link)) {
		const create = container.createEl('button', { text: 'Create missing note', cls: 'link-doctor-fix-button' });
		create.addEventListener('click', () => void fixes.run(link, { kind: 'create' }));
	}
	const remove = container.createEl('button', { text: 'Remove link, keep text', cls: 'link-doctor-fix-button' });
	remove.addEventListener('click', () => void fixes.run(link, { kind: 'remove' }));
}
