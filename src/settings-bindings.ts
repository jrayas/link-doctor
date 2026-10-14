import { BROKEN_TYPES, type BrokenType } from './core/types';
import { validateSettings, type LinkDoctorSettings } from './settings';

const TYPE_PREFIX = 'enabledTypes.';

function brokenTypeOf(key: string): BrokenType | null {
	if (!key.startsWith(TYPE_PREFIX)) return null;
	const name = key.slice(TYPE_PREFIX.length);
	return BROKEN_TYPES.find((type) => type === name) ?? null;
}

/** The value a settings control shows for `key`. Pure: no Obsidian import. */
export function readControl(settings: LinkDoctorSettings, key: string): unknown {
	const type = brokenTypeOf(key);
	if (type) return settings.enabledTypes[type];
	switch (key) {
		case 'defaultPanelMode':
			return settings.defaultPanelMode;
		case 'rememberLastMode':
			return settings.rememberLastMode;
		case 'openInNewTab':
			return settings.openInNewTab;
		case 'autoRefresh':
			return settings.autoRefresh;
		case 'debounceMs':
			return settings.debounceMs;
		case 'ignoreRules':
			return settings.ignoreRules.join('\n');
		default:
			return undefined;
	}
}

export interface WriteResult {
	/** True when the change affects which links count as broken, so the vault must be re-checked. */
	recheck: boolean;
	/** False when the key is unknown or the value had the wrong type, so nothing was stored. */
	stored: boolean;
}

/** Stores a value from a settings control, cleaning it the same way saved data is cleaned on load. */
export function writeControl(settings: LinkDoctorSettings, key: string, value: unknown): WriteResult {
	const type = brokenTypeOf(key);
	if (type) {
		if (typeof value !== 'boolean') return { recheck: false, stored: false };
		settings.enabledTypes[type] = value;
		return { recheck: true, stored: true };
	}
	switch (key) {
		case 'defaultPanelMode':
			settings.defaultPanelMode = value === 'all' ? 'all' : 'current';
			return { recheck: false, stored: true };
		case 'rememberLastMode':
		case 'openInNewTab':
		case 'autoRefresh':
			if (typeof value !== 'boolean') return { recheck: false, stored: false };
			settings[key] = value;
			return { recheck: false, stored: true };
		case 'debounceMs':
			if (typeof value !== 'number') return { recheck: false, stored: false };
			settings.debounceMs = validateSettings({ debounceMs: value }).debounceMs;
			return { recheck: false, stored: true };
		case 'ignoreRules':
			if (typeof value !== 'string') return { recheck: false, stored: false };
			settings.ignoreRules = validateSettings({ ignoreRules: value }).ignoreRules;
			return { recheck: true, stored: true };
		default:
			return { recheck: false, stored: false };
	}
}
