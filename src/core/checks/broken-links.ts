import { detectAll, type DetectOptions } from '../detect';
import type { BrokenLink } from '../types';
import type { Finding, HealthCheck } from './types';

export interface BrokenLinkFinding extends Finding {
	checkId: 'broken-links';
	broken: BrokenLink;
}

export const brokenLinksCheck: HealthCheck<BrokenLinkFinding, DetectOptions> = {
	id: 'broken-links',
	label: 'Broken links',
	run(index, options) {
		return detectAll(index, options).map((broken) => ({
			checkId: 'broken-links' as const,
			sourcePath: broken.sourcePath,
			message: broken.original,
			broken,
		}));
	},
};
