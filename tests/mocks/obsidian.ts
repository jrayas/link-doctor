// Minimal runtime stub of the `obsidian` module for unit and integration tests.
// Extend it only as far as the code under test needs.
export class Plugin {
	app: unknown;
	manifest: unknown;
	constructor(app?: unknown, manifest?: unknown) {
		this.app = app;
		this.manifest = manifest;
	}
	onload(): void | Promise<void> {}
	onunload(): void {}
}

export function normalizePath(path: string): string {
	return path.replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '') || '/';
}

export class TFile {
	path: string;
	extension: string;
	constructor(path = '') {
		this.path = path;
		this.extension = path.split('.').pop() ?? '';
	}
}
