import { describe, expect, it } from 'vitest';
import { BROKEN_TYPES } from '../../src/core/types';
import { defaultSettings } from '../../src/settings';
import { readControl, writeControl } from '../../src/settings-bindings';

describe('settings bindings', () => {
	it('reads every control key from the settings', () => {
		const s = defaultSettings();
		expect(readControl(s, 'defaultPanelMode')).toBe('current');
		expect(readControl(s, 'rememberLastMode')).toBe(false);
		expect(readControl(s, 'openInNewTab')).toBe(true);
		expect(readControl(s, 'autoRefresh')).toBe(true);
		expect(readControl(s, 'debounceMs')).toBe(500);
		expect(readControl(s, 'ignoreRules')).toBe('');
		for (const type of BROKEN_TYPES) expect(readControl(s, `enabledTypes.${type}`)).toBe(true);
		expect(readControl(s, 'nonsense')).toBeUndefined();
		expect(readControl(s, 'enabledTypes.bogus')).toBeUndefined();
	});

	it('writes toggles and the panel mode without a re-check', () => {
		const s = defaultSettings();
		expect(writeControl(s, 'openInNewTab', false)).toEqual({ recheck: false, stored: true });
		expect(s.openInNewTab).toBe(false);
		expect(writeControl(s, 'defaultPanelMode', 'all')).toEqual({ recheck: false, stored: true });
		expect(s.defaultPanelMode).toBe('all');
		writeControl(s, 'defaultPanelMode', 'sideways');
		expect(s.defaultPanelMode).toBe('current');
		writeControl(s, 'rememberLastMode', true);
		writeControl(s, 'autoRefresh', false);
		expect(s).toMatchObject({ rememberLastMode: true, autoRefresh: false });
	});

	it('asks for a re-check when link types or ignore rules change', () => {
		const s = defaultSettings();
		expect(writeControl(s, 'enabledTypes.missing-embed', false)).toEqual({ recheck: true, stored: true });
		expect(s.enabledTypes['missing-embed']).toBe(false);
		expect(s.enabledTypes['missing-note']).toBe(true);
		expect(writeControl(s, 'ignoreRules', ' Templates/ \n\nArchive/**\nTemplates/')).toEqual({ recheck: true, stored: true });
		expect(s.ignoreRules).toEqual(['Templates/', 'Archive/**']);
		expect(readControl(s, 'ignoreRules')).toBe('Templates/\nArchive/**');
	});

	it('clamps the refresh delay and rejects values of the wrong type', () => {
		const s = defaultSettings();
		writeControl(s, 'debounceMs', 1);
		expect(s.debounceMs).toBe(100);
		writeControl(s, 'debounceMs', 99999);
		expect(s.debounceMs).toBe(5000);
		const before = structuredClone(s);
		expect(writeControl(s, 'debounceMs', '300').stored).toBe(false);
		expect(writeControl(s, 'autoRefresh', 'yes').stored).toBe(false);
		expect(writeControl(s, 'enabledTypes.missing-note', 1).stored).toBe(false);
		expect(writeControl(s, 'ignoreRules', 5).stored).toBe(false);
		expect(writeControl(s, 'unknown', true).stored).toBe(false);
		expect(s).toEqual(before);
	});
});
