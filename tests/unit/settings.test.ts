import { describe, expect, it } from 'vitest';
import { defaultSettings, enabledTypeSet, SETTINGS_VERSION, startingMode, validateSettings } from '../../src/settings';

describe('validateSettings', () => {
	it('returns defaults for missing or non-object data', () => {
		for (const raw of [undefined, null, 5, 'x', [], true]) {
			expect(validateSettings(raw)).toEqual(defaultSettings());
		}
	});

	it('keeps valid values', () => {
		const s = validateSettings({
			defaultPanelMode: 'all',
			rememberLastMode: true,
			lastPanelMode: 'all',
			fuzzyThreshold: 0.7,
			autoRefresh: false,
			debounceMs: 900,
			confirmBeforeFix: false,
			openInNewTab: false,
			ignoreRules: ['Templates/', '*.canvas'],
			enabledTypes: { 'missing-embed': false },
		});
		expect(s).toMatchObject({
			defaultPanelMode: 'all', rememberLastMode: true, lastPanelMode: 'all', fuzzyThreshold: 0.7,
			autoRefresh: false, debounceMs: 900, confirmBeforeFix: false, openInNewTab: false, ignoreRules: ['Templates/', '*.canvas'],
		});
		expect(s.enabledTypes['missing-embed']).toBe(false);
		expect(s.enabledTypes['missing-note']).toBe(true);
	});

	it('falls back field by field when values are malformed', () => {
		const s = validateSettings({
			defaultPanelMode: 'sideways',
			rememberLastMode: 'yes',
			fuzzyThreshold: 'high',
			debounceMs: NaN,
			autoRefresh: 1,
			enabledTypes: { 'missing-note': 'no', bogus: false },
			ignoreRules: 42,
		});
		expect(s).toEqual(defaultSettings());
	});

	it('clamps numbers into range', () => {
		expect(validateSettings({ fuzzyThreshold: 5 }).fuzzyThreshold).toBe(0.95);
		expect(validateSettings({ fuzzyThreshold: -1 }).fuzzyThreshold).toBe(0.2);
		expect(validateSettings({ debounceMs: 1 }).debounceMs).toBe(100);
		expect(validateSettings({ debounceMs: 99999.7 }).debounceMs).toBe(5000);
		expect(Number.isInteger(validateSettings({ debounceMs: 250.6 }).debounceMs)).toBe(true);
	});

	it('cleans ignore rules: trims, dedupes, drops non-strings and accepts a multi-line string', () => {
		expect(validateSettings({ ignoreRules: [' a/ ', 'a/', '', 3, null, 'b'] }).ignoreRules).toEqual(['a/', 'b']);
		expect(validateSettings({ ignoreRules: 'x/\r\ny/\n\nz' }).ignoreRules).toEqual(['x/', 'y/', 'z']);
		expect(validateSettings({ ignoreRules: Array.from({ length: 500 }, (_, i) => `r${i}`) }).ignoreRules).toHaveLength(200);
		expect(validateSettings({ ignoreRules: ['x'.repeat(1000)] }).ignoreRules[0]).toHaveLength(300);
	});

	it('migrates data without a version and stamps the current one', () => {
		expect(validateSettings({ autoRefresh: false }).settingsVersion).toBe(SETTINGS_VERSION);
		expect(validateSettings({ settingsVersion: 999, autoRefresh: false }).autoRefresh).toBe(false);
	});

	it('does not share state between calls', () => {
		const a = defaultSettings();
		a.enabledTypes['missing-note'] = false;
		expect(defaultSettings().enabledTypes['missing-note']).toBe(true);
	});
});

describe('helpers', () => {
	it('chooses the starting mode', () => {
		const s = defaultSettings();
		s.defaultPanelMode = 'current';
		s.lastPanelMode = 'all';
		expect(startingMode(s)).toBe('current');
		s.rememberLastMode = true;
		expect(startingMode(s)).toBe('all');
	});

	it('lists enabled types', () => {
		const s = defaultSettings();
		s.enabledTypes['missing-block'] = false;
		expect(enabledTypeSet(s).size).toBe(4);
		expect(enabledTypeSet(s).has('missing-block')).toBe(false);
	});
});
