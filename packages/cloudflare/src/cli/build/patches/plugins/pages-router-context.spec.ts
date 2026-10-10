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
	"node_modules/next/dist/shared/lib/unknown-context.shared-runtime.js": "shared-runtime",
	"node_modules/next/dist/shared/lib/side-effect.js": "side-effect",
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
 * Bundles a `require(request)` issued from `next/dist/shared/lib` (i.e. from `next/dist/shared/lib/head.js`)
 * and returns the value exported by the module it resolves to.
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
	test.each(["16.3.8", "15.5.27", "15.3.0", "15.0.0"])(
		"remaps `*.shared-runtime` requests to the vendored contexts for Next %s",
		async (nextVersion) => {
			expect(await requireFromSharedLib("./head-manager-context.shared-runtime", nextVersion)).toBe(
				"vendored"
			);
			expect(
				await requireFromSharedLib("next/dist/shared/lib/head-manager-context.shared-runtime", nextVersion)
			).toBe("vendored");
		}
	);

	test("remaps `*.shared-runtime` requests to the `future/` vendored contexts for Next 14", async () => {
		expect(await requireFromSharedLib("./head-manager-context.shared-runtime", "14.2.0")).toBe(
			"future-vendored"
		);
	});

	test("keeps the original module when there is no vendored context", async () => {
		expect(await requireFromSharedLib("./unknown-context.shared-runtime", "16.3.8")).toBe("shared-runtime");
	});

	test("does not remap explicit `.shared-runtime.js` requests", async () => {
		// Mirrors Next's `request.endsWith(".shared-runtime")` check
		expect(await requireFromSharedLib("./head-manager-context.shared-runtime.js", "16.3.8")).toBe(
			"shared-runtime"
		);
	});

	test("does not remap other requests", async () => {
		expect(await requireFromSharedLib("./side-effect", "16.3.8")).toBe("side-effect");
	});
});
