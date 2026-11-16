import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

// Worker-only: Next dev does not build these artifacts. Both webpack and Turbopack run this spec.
// playground16 sets `buildOutputPath: ".cache"`.
const outputDir = path.join(__dirname, "../.cache/.open-next");

// The instrumentation hook is registered by the server, the proxy must not bundle it.
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1401
test("the proxy does not bundle the instrumentation hook", () => {
	// Set by `instrumentation.js`
	const marker = "__NODEJS_INSTRUMENTATION_SETUP";
	const serverDir = path.join(outputDir, "server-functions/default");
	// Include both the root re-export and the actual handler in monorepo builds.
	const serverCode = readdirSync(serverDir, { recursive: true })
		.filter((entry) => path.basename(entry) === "handler.mjs")
		.map((handler) => readFileSync(path.join(serverDir, handler), "utf-8"))
		.join("\n");
	const middlewareCode = readFileSync(path.join(outputDir, "middleware/handler.mjs"), "utf-8");

	// Booleans so that a failure does not print the bundles
	expect(serverCode.includes(marker), "the server bundles the hook").toBe(true);
	expect(middlewareCode.includes(marker), "the proxy bundles the hook").toBe(false);
});

// The module of Next.js registering the instrumentation hook is replaced with a no-op, so that
// its dependencies are not bundled in the proxy.
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1373
test("the proxy does not bundle the instrumentation registration", () => {
	const { inputs } = JSON.parse(
		readFileSync(path.join(outputDir, "middleware/handler.mjs.meta.json"), "utf-8")
	) as { inputs: Record<string, unknown> };

	expect(Object.keys(inputs).filter((input) => input.includes("instrumentation-node-extensions"))).toEqual(
		[]
	);
});
