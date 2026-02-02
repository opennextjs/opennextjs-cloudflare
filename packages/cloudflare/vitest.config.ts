import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		/**
		 * Explicitly set root to current directory for this package.
		 *
		 * In monorepo setups, this vitest.config.ts takes priority over any parent
		 * vite.config.js files, preventing Vitest from using unrelated configurations
		 * from parent directories that may reference dependencies not installed in
		 * this package.
		 *
		 * This is the recommended approach for monorepo packages to ensure isolated
		 * test configuration.
		 *
		 * See: https://vitest.dev/config/
		 */
		root: ".",
	},
});
