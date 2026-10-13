import type { VaultIndex } from '../resolve';

/** One finding from a health check; richer checks extend this. */
export interface Finding {
	checkId: string;
	sourcePath: string;
	message: string;
}

/**
 * Extension point: broken links are the first check. Orphan notes, unused attachments,
 * duplicate names and so on can be added as further checks without touching the UI shell.
 */
export interface HealthCheck<TFinding extends Finding = Finding, TOptions = object> {
	id: string;
	label: string;
	run(index: VaultIndex, options: TOptions): TFinding[];
}
