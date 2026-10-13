import { foldLoose, foldName } from './text';

const MAX_LENGTH = 200;

export interface FuzzyCandidate<T> {
	text: string;
	value: T;
}

export interface FuzzyResult<T> {
	value: T;
	text: string;
	score: number;
}

function normalise(value: string): string {
	return foldLoose(value).replace(/[\s_\-.]+/g, ' ').trim().slice(0, MAX_LENGTH);
}

function levenshtein(a: string[], b: string[]): number {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
		}
		prev = cur;
	}
	return prev[b.length] ?? 0;
}

function trigrams(chars: string[]): Map<string, number> {
	const padded = [' ', ...chars, ' '];
	const grams = new Map<string, number>();
	if (padded.length < 3) {
		grams.set(padded.join(''), 1);
		return grams;
	}
	for (let i = 0; i <= padded.length - 3; i++) {
		const g = padded.slice(i, i + 3).join('');
		grams.set(g, (grams.get(g) ?? 0) + 1);
	}
	return grams;
}

function dice(a: Map<string, number>, b: Map<string, number>): number {
	let overlap = 0;
	let total = 0;
	for (const n of a.values()) total += n;
	for (const n of b.values()) total += n;
	for (const [g, n] of a) overlap += Math.min(n, b.get(g) ?? 0);
	return total === 0 ? 0 : (2 * overlap) / total;
}

/**
 * Similarity between two names from 0 to 1. Case, Unicode form and accents are ignored for the
 * comparison, but an exact match (same case and form) always scores 1 and an accent-only
 * difference scores just below it. Works on code points, so CJK and emoji names are safe.
 */
export function similarity(query: string, candidate: string): number {
	if (foldName(query) === foldName(candidate)) return 1;
	const a = normalise(query);
	const b = normalise(candidate);
	if (a === '' || b === '') return 0;
	if (a === b) return 0.97;
	const ac = Array.from(a);
	const bc = Array.from(b);
	const lev = 1 - levenshtein(ac, bc) / Math.max(ac.length, bc.length);
	const tri = dice(trigrams(ac), trigrams(bc));
	let score = 0.5 * lev + 0.5 * tri;
	const [short, long] = ac.length <= bc.length ? [a, b] : [b, a];
	if (short.length >= 3 && long.includes(short)) {
		score = Math.max(score, 0.55 + 0.4 * (short.length / long.length));
	}
	return Math.min(score, 0.96);
}

/** Candidates scoring at least `threshold`, best first, ties broken by shorter text then alphabetically. */
export function rankMatches<T>(
	query: string,
	candidates: readonly FuzzyCandidate<T>[],
	threshold: number,
	limit: number,
): FuzzyResult<T>[] {
	const results: FuzzyResult<T>[] = [];
	for (const c of candidates) {
		const score = similarity(query, c.text);
		if (score >= threshold) results.push({ value: c.value, text: c.text, score });
	}
	results.sort((x, y) => y.score - x.score || x.text.length - y.text.length || (x.text < y.text ? -1 : 1));
	return results.slice(0, limit);
}

export type Confidence = 'high' | 'medium' | 'low';

export function confidenceOf(score: number): Confidence {
	if (score >= 0.85) return 'high';
	if (score >= 0.6) return 'medium';
	return 'low';
}
