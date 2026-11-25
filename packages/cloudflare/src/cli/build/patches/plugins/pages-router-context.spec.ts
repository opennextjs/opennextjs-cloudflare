import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { patchPagesRouterContext } from "./pages-router-context.js";

// Each module exports where it has been loaded from.
const fixture = {
	"node_modules/next/dist/shared/lib/head-manager-context.shared-runtime.js": "shared-runtime",
	"node_modules/next/dist/server/route-modules/pages/vendored/contexts/head-manager-context.js": "vendored",
	"node_modules/next/dist/server/future/route-modules/pages/vendored/contexts/head-manager-context.js":
		"future-vendored",
};

let root: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "pages-router-context-"));
	for (const [path, origin] of Object.entries(fixture)) {
		mkdirSync(join(root, dirname(path)), { recursive: true });
		writeFileSync(join(root, path), `module.exports = ${JSON.stringify(origin)};`);
	}
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

/**
 * Bundles `require(request)` from `next/dist/shared/lib` with the plugin.
 *
 * @param request - The module request.
 * @param nextVersion - The Next.js version.
 * @returns The value exported by the resolved module.
 */
async function requireFromSharedLib(request: string, nextVersion: string) {
	const result = await build({
		stdin: {
			contents: `module.exports = require(${JSON.stringify(request)});`,
			resolveDir: join(root, "node_modules/next/dist/shared/lib"),
		},
		bundle: true,
		write: false,
		format: "cjs",
		platform: "node",
		logLevel: "silent",
		plugins: [patchPagesRouterContext({ nextVersion } as BuildOptions)],
	});

	const module = { exports: {} };
	runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports });
	return module.exports;
}

describe("patchPagesRouterContext", () => {
	test.each([
		["14.2.0", "future-vendored"],
		["15.3.0", "vendored"],
		["16.4.5", "vendored"],
	])("remaps `*.shared-runtime` requests for Next %s", async (nextVersion, expected) => {
		expect(await requireFromSharedLib("./head-manager-context.shared-runtime", nextVersion)).toBe(expected);
		expect(
			await requireFromSharedLib("next/dist/shared/lib/head-manager-context.shared-runtime", nextVersion)
		).toBe(expected);
	});
});
