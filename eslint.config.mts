import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'test-vault',
		'public',
		'esbuild.config.mjs',
		'scripts/*.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Dev-only code runs in Node, never inside Obsidian, so Node imports are fine here.
		files: ['tests/**/*.ts', 'vitest.config.ts'],
		rules: { 'obsidianmd/no-nodejs-modules': 'off', 'obsidianmd/prefer-window-timers': 'off' },
	},
);
