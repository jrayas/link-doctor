import { debounce, PluginSettingTab, Setting, type App } from 'obsidian';
import { findRegexLikeRules } from '../core/ignore';
import { BROKEN_TYPE_LABELS, BROKEN_TYPES } from '../core/types';
import { DEBOUNCE_RANGE, defaultSettings, FUZZY_RANGE, validateSettings } from '../settings';
import { ConfirmModal } from './confirm-modal';
import type LinkDoctorPlugin from '../main';

export class LinkDoctorSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: LinkDoctorPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.plugin.settings;
		// Changes that affect which links count as broken re-check the vault; the rest do not.
		const save = (recheck: boolean) => {
			void this.plugin.saveSettings();
			this.plugin.applySettings(recheck);
		};

		new Setting(containerEl)
			.setName('Default panel mode')
			.setDesc('Which links the side panel shows when it opens.')
			.addDropdown((d) =>
				d
					.addOption('current', 'Current note')
					.addOption('all', 'All notes')
					.setValue(settings.defaultPanelMode)
					.onChange((value) => {
						settings.defaultPanelMode = value === 'all' ? 'all' : 'current';
						save(false);
					}),
			);

		new Setting(containerEl)
			.setName('Remember last panel mode')
			.setDesc('Start in whichever mode you used last instead of the default.')
			.addToggle((t) =>
				t.setValue(settings.rememberLastMode).onChange((value) => {
					settings.rememberLastMode = value;
					save(false);
				}),
			);

		new Setting(containerEl)
			.setName('Open notes in a new tab')
			.setDesc('When on, the link buttons, panel rows and empty note buttons open a new tab. When off, they reuse the current tab, which replaces the dashboard if you click from it.')
			.addToggle((t) =>
				t.setValue(settings.openInNewTab).onChange((value) => {
					settings.openInNewTab = value;
					save(false);
				}),
			);

		new Setting(containerEl).setName('Link types to check').setHeading();
		for (const type of BROKEN_TYPES) {
			new Setting(containerEl).setName(BROKEN_TYPE_LABELS[type]).addToggle((t) =>
				t.setValue(settings.enabledTypes[type]).onChange((value) => {
					settings.enabledTypes[type] = value;
					save(true);
				}),
			);
		}

		new Setting(containerEl).setName('Ignore rules').setHeading();
		const ruleStatus = createDiv({ cls: 'link-doctor-rule-status' });
		const describeRules = () => {
			const rules = settings.ignoreRules;
			const regexLike = findRegexLikeRules(rules);
			ruleStatus.setText(
				regexLike.length > 0
					? `${rules.length} active. Regular expressions are not supported, so these are matched literally: ${regexLike.join(', ')}`
					: `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} active.`,
			);
		};
		const saveRules = debounce((text: string) => {
			settings.ignoreRules = validateSettings({ ignoreRules: text }).ignoreRules;
			describeRules();
			save(true);
		}, 600, true);
		new Setting(containerEl)
			.setName('Ignored folders and patterns')
			.setDesc(
				'One rule per line. Notes that match are not checked. A name ending in a slash is a folder, for example "Templates/". Use * for any characters within a name and ** across folders, for example "Archive/**" or "*.excalidraw.md". Lines starting with # are comments.',
			)
			.addTextArea((a) => {
				a.setPlaceholder('Templates/\nArchive/**\n*.excalidraw.md').setValue(settings.ignoreRules.join('\n'));
				a.inputEl.rows = 5;
				a.inputEl.addClass('link-doctor-rules-input');
				a.inputEl.setAttribute('aria-label', 'Ignored folders and patterns, one per line');
				a.onChange((value) => saveRules(value));
			});
		containerEl.appendChild(ruleStatus);
		describeRules();

		new Setting(containerEl).setName('Suggestions').setHeading();
		new Setting(containerEl)
			.setName('Match strictness')
			.setDesc('Higher values suggest only very close matches. Lower values suggest more, but less certain, ones.')
			.addSlider((s) =>
				s
					.setLimits(Math.round(FUZZY_RANGE.min * 100), Math.round(FUZZY_RANGE.max * 100), 5)
					.setValue(Math.round(settings.fuzzyThreshold * 100))
					.setDynamicTooltip()
					.onChange((value) => {
						settings.fuzzyThreshold = value / 100;
						save(false);
					}),
			);

		new Setting(containerEl).setName('Refreshing').setHeading();
		let delaySetting: Setting;
		new Setting(containerEl)
			.setName('Refresh automatically')
			.setDesc('Keep results up to date as notes change. When off, use the rescan button instead.')
			.addToggle((t) =>
				t.setValue(settings.autoRefresh).onChange((value) => {
					settings.autoRefresh = value;
					delaySetting.setDisabled(!value);
					save(false);
					if (value) void this.plugin.rescan();
				}),
			);
		delaySetting = new Setting(containerEl)
			.setName('Refresh delay')
			.setDesc('How long to wait after a change before updating, in milliseconds. Longer saves battery on large vaults.')
			.addSlider((s) =>
				s
					.setLimits(DEBOUNCE_RANGE.min, DEBOUNCE_RANGE.max, 100)
					.setValue(settings.debounceMs)
					.setDynamicTooltip()
					.onChange((value) => {
						settings.debounceMs = value;
						save(false);
					}),
			)
			.setDisabled(!settings.autoRefresh);

		new Setting(containerEl).setName('Fixes').setHeading();
		new Setting(containerEl)
			.setName('Confirm before applying a fix')
			.setDesc('Show a before and after preview first. Every fix can be undone either way.')
			.addToggle((t) =>
				t.setValue(settings.confirmBeforeFix).onChange((value) => {
					settings.confirmBeforeFix = value;
					save(false);
				}),
			);

		new Setting(containerEl)
			.setName('Reset to defaults')
			.setDesc('Restores every option on this page. Your notes are not touched.')
			.addButton((b) =>
				b
					.setButtonText('Reset')
					.setWarning()
					.onClick(async () => {
						const ok = await new ConfirmModal(this.app, 'Reset settings', 'Restore all Link Doctor settings to their defaults?', 'Reset').openAndWait();
						if (!ok) return;
						this.plugin.settings = defaultSettings();
						save(true);
						this.display();
					}),
			);
	}
}
