import path from "node:path";
import { runInNewContext } from "node:vm";

import logger from "@opennextjs/aws/logger.js";
import { build } from "esbuild";
import { afterEach, describe, expect, test, vi } from "vitest";

import { stubNativeAddons } from "./native-addons.js";

const resolveDir = path.join(process.cwd(), "fixtures");

/**
 * Bundles `contents` with the plugin.
 */
async function bundle(contents: string) {
	const result = await build({
		stdin: { contents, resolveDir },
		bundle: true,
		write: false,
		format: "cjs",
		platform: "node",
		logLevel: "silent",
		plugins: [stubNativeAddons()],
	});

	return result.outputFiles[0]!.text;
}

describe("stubNativeAddons", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("falls back when a native addon is required in a try/catch", async () => {
		vi.spyOn(logger, "warn").mockImplementation(() => {});

		// Mirrors `ssh2` requiring `cpu-features`
		const code = await bundle(`
			let cpuFeatures;
			try {
				cpuFeatures = require("./build/Release/cpufeatures.node");
			} catch (error) {
				cpuFeatures = { fallback: true, code: error.code };
			}
			module.exports = cpuFeatures;
		`);

		expect(code).toContain("MODULE_NOT_FOUND");

		const module: { exports: unknown } = { exports: {} };
		runInNewContext(code, { module, exports: module.exports });
		expect(module.exports).toEqual({ fallback: true, code: "MODULE_NOT_FOUND" });
	});

	test("throws MODULE_NOT_FOUND naming the addon when it is evaluated", async () => {
		vi.spyOn(logger, "warn").mockImplementation(() => {});

		const code = await bundle(`require("./build/Release/cpufeatures.node");`);

		let error: NodeJS.ErrnoException | undefined;
		try {
			runInNewContext(code, { module: {}, exports: {} });
		} catch (e) {
			error = e as NodeJS.ErrnoException;
		}

		const addonPath = path.join(resolveDir, "build/Release/cpufeatures.node").replaceAll("\\", "/");
		expect(error?.message).toBe(`Native addon "${addonPath}" is not supported on Workers`);
		expect(error?.code).toBe("MODULE_NOT_FOUND");
	});

	test("warns once per distinct addon", async () => {
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

		await bundle(`
			try { require("./a.node"); } catch {}
			try { require("./a.node"); } catch {}
			try { require("./b.node"); } catch {}
		`);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0]![0]).toContain("a.node");
		expect(warn.mock.calls[1]![0]).toContain("b.node");
	});
});
