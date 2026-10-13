import { debounce, MarkdownView, Notice, FileView, Plugin, type Debouncer, type WorkspaceLeaf } from 'obsidian';
import { createVaultPort, wireVaultEvents } from './adapters/obsidian-port';
import { IndexService } from './adapters/index-service';
import { compileIgnoreRules } from './core/ignore';
import { DiagnosticsModal } from './ui/diagnostics-modal';
import { PANEL_VIEW_TYPE, PanelView } from './ui/panel-view';
import { defaultSettings, enabledTypeSet, startingMode, validateSettings, type LinkDoctorSettings, type PanelMode } from './settings';

export default class LinkDoctorPlugin extends Plugin {
	settings: LinkDoctorSettings = defaultSettings();
	service!: IndexService;
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
		this.applySettings();

		this.refreshPanels = debounce(() => this.panels().forEach((p) => p.refresh()), this.settings.debounceMs, true);
		this.register(this.service.onEvent(() => this.refreshPanels()));
		this.register(() => this.service.dispose());

		this.registerView(PANEL_VIEW_TYPE, (leaf) => new PanelView(leaf, this));
		this.addRibbonIcon('stethoscope', 'Open link doctor', () => void this.activatePanel());
		this.addCommand({ id: 'open-panel', name: 'Open panel', callback: () => void this.activatePanel() });
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

	/** Recompiles anything derived from settings and re-checks the vault. */
	applySettings(): void {
		this.ignored = compileIgnoreRules(this.settings.ignoreRules);
		this.service?.refreshOptions();
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
