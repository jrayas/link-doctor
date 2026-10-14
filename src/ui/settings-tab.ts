import { debounce, PluginSettingTab, type App, type Debouncer, type Setting, type SettingDefinitionItem } from 'obsidian';
import { findRegexLikeRules } from '../core/ignore';
import { BROKEN_TYPE_LABELS, BROKEN_TYPES } from '../core/types';
import { DEBOUNCE_RANGE, defaultSettings } from '../settings';
import { readControl, writeControl } from '../settings-bindings';
import { ConfirmModal } from './confirm-modal';
import type LinkDoctorPlugin from '../main';

const RULE_SAVE_DELAY_MS = 600;

/**
 * The settings page, described declaratively (Obsidian 1.13 and later) so that every option shows
 * up in Obsidian's settings search. The key-to-value mapping lives in `settings-bindings.ts`.
 */
export class LinkDoctorSettingTab extends PluginSettingTab {
	private ruleStatusEl: HTMLElement | null = null;
	private rulesPending = false;
	private readonly applyRules: Debouncer<[], void>;

	constructor(app: App, private readonly plugin: LinkDoctorPlugin) {
		super(app, plugin);
		// Typing in the rules box must not re-check the vault on every keystroke.
		this.applyRules = debounce(() => this.flushRules(), RULE_SAVE_DELAY_MS, true);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = () => this.plugin.settings;
		return [
			{
				name: 'Default panel mode',
				desc: 'Which links the side panel shows when it opens.',
				control: { type: 'dropdown', key: 'defaultPanelMode', options: { current: 'Current note', all: 'All notes' } },
			},
			{
				name: 'Remember last panel mode',
				desc: 'Start in whichever mode you used last instead of the default.',
				control: { type: 'toggle', key: 'rememberLastMode' },
			},
			{
				name: 'Open notes in a new tab',
				desc: 'When on, the link buttons, panel rows and empty note buttons open a new tab. When off, they reuse the current tab, which replaces the dashboard if you click from it.',
				control: { type: 'toggle', key: 'openInNewTab' },
			},
			{
				type: 'group',
				heading: 'Link types to check',
				items: BROKEN_TYPES.map((type) => ({
					name: BROKEN_TYPE_LABELS[type],
					control: { type: 'toggle' as const, key: `enabledTypes.${type}` },
				})),
			},
			{
				type: 'group',
				heading: 'Ignore rules',
				items: [
					{
						name: 'Ignored folders and patterns',
						desc: 'One rule per line. Notes that match are not checked. A name ending in a slash is a folder, for example "Templates/". Use * for any characters within a name and ** across folders, for example "Archive/**" or "*.excalidraw.md". Lines starting with # are comments.',
						control: { type: 'textarea', key: 'ignoreRules', placeholder: 'Templates/\nArchive/**\n*.excalidraw.md', rows: 5 },
					},
					{
						name: 'Active rules',
						searchable: false,
						render: (setting: Setting) => {
							setting.setName('Active rules');
							this.ruleStatusEl = setting.descEl;
							this.describeRules();
							return () => {
								this.ruleStatusEl = null;
							};
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Refreshing',
				items: [
					{
						name: 'Refresh automatically',
						desc: 'Keep results up to date as notes change. When off, use the rescan button instead.',
						control: { type: 'toggle', key: 'autoRefresh' },
					},
					{
						name: 'Refresh delay',
						desc: 'How long to wait after a change before updating, in milliseconds. Longer saves battery on large vaults.',
						control: {
							type: 'slider',
							key: 'debounceMs',
							min: DEBOUNCE_RANGE.min,
							max: DEBOUNCE_RANGE.max,
							step: 100,
							disabled: () => !settings().autoRefresh,
						},
					},
				],
			},
			{
				name: 'Reset to defaults',
				desc: 'Restores every option on this page. Your notes are not touched.',
				searchable: true,
				render: (setting: Setting) => {
					setting.setName('Reset to defaults').setDesc('Restores every option on this page. Your notes are not touched.');
					setting.addButton((button) =>
						button
							.setButtonText('Reset')
							.setDestructive()
							.onClick(() => void this.confirmReset()),
					);
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		return readControl(this.plugin.settings, key);
	}

	setControlValue(key: string, value: unknown): void {
		const { recheck, stored } = writeControl(this.plugin.settings, key, value);
		if (!stored) return;
		if (key === 'ignoreRules') {
			this.rulesPending = true;
			this.describeRules();
			this.applyRules();
			return;
		}
		void this.plugin.saveSettings();
		this.plugin.applySettings(recheck);
		if (key === 'autoRefresh') {
			if (value === true) void this.plugin.rescan();
			this.update(); // The refresh delay greys out or wakes up.
		}
	}

	/** Make sure typed rules are applied if the page is closed before the delay is up. */
	hide(): void {
		this.applyRules.cancel();
		this.flushRules();
		super.hide();
	}

	private flushRules(): void {
		if (!this.rulesPending) return;
		this.rulesPending = false;
		void this.plugin.saveSettings();
		this.plugin.applySettings(true);
	}

	private describeRules(): void {
		if (!this.ruleStatusEl) return;
		const rules = this.plugin.settings.ignoreRules;
		const regexLike = findRegexLikeRules(rules);
		this.ruleStatusEl.setText(
			regexLike.length > 0
				? `${rules.length} active. Regular expressions are not supported, so these are matched literally: ${regexLike.join(', ')}`
				: `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} active.`,
		);
	}

	private async confirmReset(): Promise<void> {
		const ok = await new ConfirmModal(this.app, 'Reset settings', 'Restore all Link Doctor settings to their defaults?', 'Reset').openAndWait();
		if (!ok) return;
		this.applyRules.cancel();
		this.rulesPending = false;
		this.plugin.settings = defaultSettings();
		await this.plugin.saveSettings();
		this.plugin.applySettings(true);
		this.update();
	}
}
