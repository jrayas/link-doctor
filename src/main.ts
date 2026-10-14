import { debounce, MarkdownView, Notice, FileView, Plugin, type Debouncer, type WorkspaceLeaf } from 'obsidian';
import { createFixHost } from './adapters/obsidian-fix-host';
import { FixService } from './adapters/fix-service';
import { createVaultPort, wireVaultEvents } from './adapters/obsidian-port';
import { IndexService } from './adapters/index-service';
import { compileIgnoreRules } from './core/ignore';
import { DiagnosticsModal } from './ui/diagnostics-modal';
import { DASHBOARD_VIEW_TYPE, DashboardView } from './ui/dashboard-view';
import { PANEL_VIEW_TYPE, PanelView } from './ui/panel-view';
import { LinkDoctorSettingTab } from './ui/settings-tab';
import { defaultSettings, enabledTypeSet, startingMode, validateSettings, type LinkDoctorSettings, type PanelMode } from './settings';

export default class LinkDoctorPlugin extends Plugin {
	settings: LinkDoctorSettings = defaultSettings();
	service!: IndexService;
	fixes!: FixService;
	/** Path of the note (or file) the panel describes. Kept when focus moves to a sidebar. */
	currentPath: string | null = null;
	private ignored: (path: string) => boolean = () => false;
	private refreshPanels!: Debouncer<[], void>;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.service = new IndexService(createVaultPort(this.app), () => ({
			enabledTypes: enabledTypeSet(this.settings),
			isIgnored: this.ignored,
		}));
		this.fixes = new FixService(
			createFixHost(this.app),
			() => this.service.index,
			() => this.settings,
		);
		this.applySettings();

		this.buildRefresh();
		this.register(this.service.onEvent(() => this.refreshPanels()));
		this.addSettingTab(new LinkDoctorSettingTab(this.app, this));
		this.register(() => this.service.dispose());


		this.registerView(PANEL_VIEW_TYPE, (leaf) => new PanelView(leaf, this));
		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
		this.addRibbonIcon('stethoscope', 'Open link doctor', () => void this.activatePanel());
		this.addCommand({ id: 'open-panel', name: 'Open panel', callback: () => void this.activatePanel() });
		this.addCommand({
			id: 'undo-last-fix',
			name: 'Undo last fix',
			checkCallback: (checking) => {
				if (!this.fixes.canUndo()) return false;
				if (!checking) void this.fixes.undo();
				return true;
			},
		});
		this.addCommand({ id: 'rescan', name: 'Rescan vault', callback: () => void this.rescan() });
		this.addCommand({
			id: 'show-diagnostics',
			name: 'Show diagnostics for the current note',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) new DiagnosticsModal(this.app, file, this.service).open();
				return true;
			},
		});

		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => this.trackActive(leaf)));
		this.registerEvent(this.app.workspace.on('file-open', (file) => {
			if (file) this.setCurrent(file.path);
		}));

		this.app.workspace.onLayoutReady(() => {
			this.trackActive(this.app.workspace.getMostRecentLeaf());
			wireVaultEvents(this, this.service, () => this.settings.autoRefresh);
			void this.service.scan();
		});
	}

	onunload(): void {
		// A refresh still waiting on its debounce would otherwise fire against closed views.
		(this.refreshPanels as Debouncer<[], void> | undefined)?.cancel();
		this.service?.dispose();
	}

	startingMode(): PanelMode {
		return startingMode(this.settings);
	}

	rememberMode(mode: PanelMode): void {
		if (!this.settings.rememberLastMode) return;
		this.settings.lastPanelMode = mode;
		void this.saveSettings();
	}

	async rescan(): Promise<void> {
		new Notice('Rescanning for broken links…');
		await this.service.scan();
	}

	async loadSettings(): Promise<void> {
		this.settings = validateSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Recompiles anything derived from settings. `recheck` also re-runs detection (ignore rules, link types). */
	applySettings(recheck = true): void {
		this.ignored = compileIgnoreRules(this.settings.ignoreRules);
		this.buildRefresh();
		if (recheck) this.service?.refreshOptions();
		else this.refreshPanels();
	}

	private buildRefresh(): void {
		// Nothing exists to cancel the first time through.
		(this.refreshPanels as Debouncer<[], void> | undefined)?.cancel();
		this.refreshPanels = debounce(
			() => {
				this.panels().forEach((p) => p.refresh());
				this.dashboards().forEach((d) => d.refresh());
			},
			this.settings.debounceMs,
			true,
		);
	}

	async activatePanel(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(PANEL_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: PANEL_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	async activateDashboard(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	private dashboards(): DashboardView[] {
		return this.app.workspace
			.getLeavesOfType(DASHBOARD_VIEW_TYPE)
			.map((l) => l.view)
			.filter((v): v is DashboardView => v instanceof DashboardView);
	}

	private panels(): PanelView[] {
		return this.app.workspace
			.getLeavesOfType(PANEL_VIEW_TYPE)
			.map((l) => l.view)
			.filter((v): v is PanelView => v instanceof PanelView);
	}

	private trackActive(leaf: WorkspaceLeaf | null): void {
		const view = leaf?.view;
		if (view instanceof MarkdownView || view instanceof FileView) {
			if (view.file) this.setCurrent(view.file.path);
		}
	}

	private setCurrent(path: string): void {
		if (this.currentPath === path) return;
		this.currentPath = path;
		this.panels().forEach((p) => p.refresh());
	}
}
