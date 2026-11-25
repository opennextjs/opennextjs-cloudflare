import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";
import { describe, expect, test } from "vitest";

import { handleOptionalDependencies } from "./optional-deps.js";
import { patchPagesRouterContext } from "./pages-router-context.js";

const require = createRequire(import.meta.url);
const nextDir = path.dirname(require.resolve("next/package.json"));

async function resolveWithPlugin(nextVersion: string, importPath: string): Promise<string | undefined> {
	let resolvedPath: string | undefined;

	await build({
		stdin: {
			contents: `module.exports = require(${JSON.stringify(importPath)});`,
			resolveDir: path.join(nextDir, "dist/shared/lib"),
		},
		bundle: true,
		write: false,
		format: "cjs",
		platform: "node",
		logLevel: "silent",
		plugins: [
			patchPagesRouterContext({ nextVersion, appPath: process.cwd() } as BuildOptions),
			{
				name: "capture-resolved",
				setup(pluginBuild) {
					pluginBuild.onLoad({ filter: /.*/ }, (args) => {
						if (args.path.includes("vendored")) {
							resolvedPath = args.path;
							return { contents: "module.exports = {};" };
						}
					});
				},
			},
		],
	});

	return resolvedPath;
}

describe("patchPagesRouterContext", () => {
	test.each(["15.0.0", "15.5.29", "16.3.5"])(
		"redirects .shared-runtime imports to pages vendored contexts for Next %s",
		async (nextVersion) => {
			const resolved = await resolveWithPlugin(nextVersion, "./head-manager-context.shared-runtime");
			expect(resolved).toBeDefined();
			expect(resolved!.replaceAll("\\", "/")).toMatch(
				/\/next\/dist\/server\/route-modules\/pages\/vendored\/contexts\/head-manager-context\.js$/
			);
		}
	);

	test("handles explicit .shared-runtime.js suffix", async () => {
		const resolved = await resolveWithPlugin("16.3.5", "./head-manager-context.shared-runtime.js");
		expect(resolved).toBeDefined();
		expect(resolved!.replaceAll("\\", "/")).toMatch(
			/\/next\/dist\/server\/route-modules\/pages\/vendored\/contexts\/head-manager-context\.js$/
		);
	});

	test("uses future/route-modules path before Next 15", () => {
		let capturedPath: string | undefined;
		const plugin = patchPagesRouterContext({ nextVersion: "14.2.0" } as BuildOptions);
		const handlers: Array<{
			filter: RegExp;
			callback: (args: { path: string; resolveDir: string }) => Promise<unknown>;
		}> = [];

		plugin.setup({
			onResolve(opts, cb) {
				handlers.push({ filter: opts.filter, callback: cb as never });
			},
		} as never);

		expect(handlers).toHaveLength(1);
		expect(handlers[0]!.filter.test("./head-manager-context.shared-runtime")).toBe(true);

		return (async () => {
			const fakeResolve = async (target: string) => {
				capturedPath = target;
				return { path: target, errors: [] };
			};
			// Re-run setup with resolve stub to verify the target path for Next < 15
			let cb: ((args: { path: string; resolveDir: string }) => Promise<unknown>) | undefined;
			plugin.setup({
				onResolve(_opts, fn) {
					cb = fn as never;
				},
				resolve: fakeResolve,
			} as never);
			await cb!({ path: "./head-manager-context.shared-runtime", resolveDir: nextDir });
			expect(capturedPath).toBe(
				"next/dist/server/future/route-modules/pages/vendored/contexts/head-manager-context.js"
			);
		})();
	});

	test("shares HeadManagerContext between next/dist/shared/lib/head and pages vendored contexts", async () => {
		const checkSameInstance = async (plugins: Parameters<typeof build>[0]["plugins"]) => {
			const result = await build({
				stdin: {
					contents: `
						const headShared = require("next/dist/shared/lib/head-manager-context.shared-runtime");
						const vendored = require("next/dist/server/route-modules/pages/vendored/contexts/head-manager-context");
						module.exports = {
							sameInstance: headShared.HeadManagerContext === vendored.HeadManagerContext,
						};
					`,
					resolveDir: path.join(nextDir, "dist/shared/lib"),
				},
				bundle: true,
				write: false,
				format: "cjs",
				platform: "node",
				define: {
					"process.env.NODE_ENV": '"production"',
					"process.env.TURBOPACK": "false",
				},
				plugins,
			});

			const exported: { sameInstance: boolean } = runInNewContext(result.outputFiles[0]!.text, {
				Buffer,
				Headers,
				Request,
				Response,
				TextDecoder,
				TextEncoder,
				URL,
				URLSearchParams,
				__dirname: "",
				__filename: "",
				clearInterval,
				clearTimeout,
				console,
				module: { exports: {} },
				exports: {},
				process: { env: { NODE_ENV: "production" } },
				setInterval,
				setTimeout,
				require,
			});
			return exported.sameInstance;
		};

		const basePlugins = [handleOptionalDependencies(["critters"])];
		expect(await checkSameInstance(basePlugins)).toBe(false);
		expect(
			await checkSameInstance([
				patchPagesRouterContext({
					nextVersion: "16.3.5",
					appPath: process.cwd(),
				} as BuildOptions),
				...basePlugins,
			])
		).toBe(true);
	});

	test("does not intercept non-Next .shared-runtime.js imports and falls back when vendored lookup misses", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-router-ctx-"));
		try {
			const thirdPartyFile = path.join(tempDir, "pkg", "custom.shared-runtime.js");
			fs.mkdirSync(path.dirname(thirdPartyFile), { recursive: true });
			fs.writeFileSync(thirdPartyFile, 'module.exports = { origin: "third-party" };');

			const fakeNextDir = path.join(tempDir, "node_modules", "next", "dist", "shared", "lib");
			const missingContextFile = path.join(fakeNextDir, "nonexistent-context.shared-runtime.js");
			fs.mkdirSync(fakeNextDir, { recursive: true });
			fs.writeFileSync(missingContextFile, 'module.exports = { origin: "original-next-fallback" };');

			const result = await build({
				stdin: {
					contents: `
						const custom = require("./pkg/custom.shared-runtime.js");
						const missing = require("next/dist/shared/lib/nonexistent-context.shared-runtime.js");
						module.exports = { custom, missing };
					`,
					resolveDir: tempDir,
				},
				bundle: true,
				write: false,
				format: "cjs",
				platform: "node",
				plugins: [
					patchPagesRouterContext({
						nextVersion: "16.3.5",
						appPath: tempDir,
					} as BuildOptions),
				],
			});

			const exported: {
				custom: { origin: string };
				missing: { origin: string };
			} = runInNewContext(result.outputFiles[0]!.text, {
				module: { exports: {} },
				exports: {},
			});
			expect(exported.custom.origin).toBe("third-party");
			expect(exported.missing.origin).toBe("original-next-fallback");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
