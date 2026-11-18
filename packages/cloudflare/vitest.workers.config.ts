import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./test/workers/wrangler.jsonc" },
			miniflare: { cf: false },
		}),
	],
	test: {
		include: ["test/workers/**/*.spec.ts"],
	},
});
