import type { BrokenType } from './core/types';
import { BROKEN_TYPES } from './core/types';

export const SETTINGS_VERSION = 1;

export type PanelMode = 'current' | 'all';

export interface LinkDoctorSettings {
	/** Bump when the shape changes and add a step to `migrate`. */
	settingsVersion: number;
	defaultPanelMode: PanelMode;
	/** When true, the last Current/All choice replaces the default on the next start. */
	rememberLastMode: boolean;
	lastPanelMode: PanelMode;
	enabledTypes: Record<BrokenType, boolean>;
	/** Glob rules, one per entry. See `compileIgnoreRules`. */
	ignoreRules: string[];
	/** Minimum similarity for fix suggestions, 0.2 (loose) to 0.95 (strict). */
	fuzzyThreshold: number;
	autoRefresh: boolean;
	debounceMs: number;
	confirmBeforeFix: boolean;
}

export const FUZZY_RANGE = { min: 0.2, max: 0.95 } as const;
export const DEBOUNCE_RANGE = { min: 100, max: 5000 } as const;
const MAX_RULES = 200;
const MAX_RULE_LENGTH = 300;

export function defaultSettings(): LinkDoctorSettings {
	return {
		settingsVersion: SETTINGS_VERSION,
		defaultPanelMode: 'current',
		rememberLastMode: false,
		lastPanelMode: 'current',
		enabledTypes: Object.fromEntries(BROKEN_TYPES.map((t) => [t, true])) as Record<BrokenType, boolean>,
		ignoreRules: [],
		fuzzyThreshold: 0.5,
		autoRefresh: true,
		debounceMs: 500,
		confirmBeforeFix: true,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickBool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function pickMode(value: unknown, fallback: PanelMode): PanelMode {
	return value === 'current' || value === 'all' ? value : fallback;
}

function pickRules(value: unknown, fallback: string[]): string[] {
	const list = typeof value === 'string' ? value.split(/\r\n|\n|\r/) : Array.isArray(value) ? (value as unknown[]) : null;
	if (list === null) return fallback;
	const seen = new Set<string>();
	for (const item of list) {
		if (typeof item !== 'string') continue;
		const rule = item.trim().slice(0, MAX_RULE_LENGTH);
		if (rule !== '') seen.add(rule);
		if (seen.size >= MAX_RULES) break;
	}
	return [...seen];
}

/** Upgrades older saved data step by step. Add a case when `SETTINGS_VERSION` changes. */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
	const data = { ...raw };
	const from = typeof data.settingsVersion === 'number' ? data.settingsVersion : 0;
	// Version 0 (no version field) has the same shape as version 1, so nothing to rewrite yet.
	if (from < SETTINGS_VERSION) data.settingsVersion = SETTINGS_VERSION;
	return data;
}

/** Turns whatever was stored into valid settings. Anything missing or malformed falls back to its default. */
export function validateSettings(raw: unknown): LinkDoctorSettings {
	const defaults = defaultSettings();
	if (!isRecord(raw)) return defaults;
	const data = migrate(raw);
	const enabledRaw = isRecord(data.enabledTypes) ? data.enabledTypes : {};
	const enabledTypes = { ...defaults.enabledTypes };
	for (const type of BROKEN_TYPES) enabledTypes[type] = pickBool(enabledRaw[type], defaults.enabledTypes[type]);
	return {
		settingsVersion: SETTINGS_VERSION,
		defaultPanelMode: pickMode(data.defaultPanelMode, defaults.defaultPanelMode),
		rememberLastMode: pickBool(data.rememberLastMode, defaults.rememberLastMode),
		lastPanelMode: pickMode(data.lastPanelMode, defaults.lastPanelMode),
		enabledTypes,
		ignoreRules: pickRules(data.ignoreRules, defaults.ignoreRules),
		fuzzyThreshold: pickNumber(data.fuzzyThreshold, defaults.fuzzyThreshold, FUZZY_RANGE.min, FUZZY_RANGE.max),
		autoRefresh: pickBool(data.autoRefresh, defaults.autoRefresh),
		debounceMs: Math.round(pickNumber(data.debounceMs, defaults.debounceMs, DEBOUNCE_RANGE.min, DEBOUNCE_RANGE.max)),
		confirmBeforeFix: pickBool(data.confirmBeforeFix, defaults.confirmBeforeFix),
	};
}

/** The panel mode to start in. */
export function startingMode(settings: LinkDoctorSettings): PanelMode {
	return settings.rememberLastMode ? settings.lastPanelMode : settings.defaultPanelMode;
}

export function enabledTypeSet(settings: LinkDoctorSettings): Set<BrokenType> {
	return new Set(BROKEN_TYPES.filter((t) => settings.enabledTypes[t]));
}
