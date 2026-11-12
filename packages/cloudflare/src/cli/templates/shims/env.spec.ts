import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

import envShim, { loadEnvConfig } from "./env.js";

/**
 * Payload's `dist/bin/loadEnv.js` imports `@next/env` with a default import and then
 * destructures `loadEnvConfig` off it, so the shim has to provide both import shapes.
 */
describe("@next/env shim", () => {
	it("exports loadEnvConfig by name and as a default export", () => {
		expect(loadEnvConfig).toBeTypeOf("function");
		expect(envShim.loadEnvConfig).toBe(loadEnvConfig);
	});

	it("bundles the default import Payload uses", async () => {
		const shimPath = fileURLToPath(new URL("./env.ts", import.meta.url));
		const result = await build({
			stdin: {
				contents: [
					`import nextEnvImport from ${JSON.stringify(shimPath)};`,
					"const { loadEnvConfig } = nextEnvImport;",
					"loadEnvConfig();",
				].join("\n"),
				resolveDir: process.cwd(),
				loader: "ts",
			},
			bundle: true,
			write: false,
			format: "esm",
			logLevel: "silent",
		});

		expect(result.errors).toEqual([]);
	});
});
