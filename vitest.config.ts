import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The `obsidian` package ships types only, so tests that touch it use a stub.
export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(new URL('./tests/mocks/obsidian.ts', import.meta.url)),
		},
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
	},
});
