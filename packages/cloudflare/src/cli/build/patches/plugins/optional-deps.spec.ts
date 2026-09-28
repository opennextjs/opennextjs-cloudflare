import { runInNewContext } from "node:vm";

import { build } from "esbuild";
import { describe, expect, test } from "vitest";

import { handleOptionalDependencies } from "./optional-deps.js";

/**
 * Bundles `contents` with the plugin and returns the error thrown when running the bundle.
 */
async function getErrorThrownByBundle(contents: string) {
	const result = await build({
		stdin: { contents, resolveDir: process.cwd() },
		bundle: true,
		write: false,
		format: "cjs",
		platform: "node",
		logLevel: "silent",
		plugins: [handleOptionalDependencies(["missing-optional-dependency"])],
	});

	try {
		runInNewContext(result.outputFiles[0]!.text, { module: {}, exports: {} });
	} catch (error) {
		return error as NodeJS.ErrnoException;
	}
	throw new Error("The bundle did not throw");
}

describe("handleOptionalDependencies", () => {
	test("replaces a missing dependency with a module that throws MODULE_NOT_FOUND", async () => {
		const error = await getErrorThrownByBundle(`require("missing-optional-dependency/server.edge");`);

		expect(error.message).toBe('Missing optional dependency "missing-optional-dependency/server.edge"');
		// Callers such as Next.js `ReactDOMServerPages` only fall back when the code is set.
		expect(error.code).toBe("MODULE_NOT_FOUND");
	});
});
