import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

// Worker-only: Next dev does not build these artifacts. Both webpack and Turbopack run this spec.
const outputDir = path.join(__dirname, "../.open-next");

test("the proxy imports OG assets from its own prepared output", () => {
	const middlewareDir = path.join(outputDir, "middleware");
	const code = readFileSync(path.join(middlewareDir, "handler.mjs"), "utf-8");
	const assets = [
		...code.matchAll(/["']([^"']+\/(?:[^/"']+\.ttf\.bin|resvg\.wasm|yoga\.wasm)(?:\?module)?)["']/g),
	].map((match) => match[1]!.replace(/\?module$/, ""));

	expect(assets).toHaveLength(3);
	expect(assets.some((asset) => asset.endsWith(".ttf.bin"))).toBe(true);
	expect(assets.some((asset) => asset.endsWith("/resvg.wasm"))).toBe(true);
	expect(assets.some((asset) => asset.endsWith("/yoga.wasm"))).toBe(true);
	for (const asset of assets) {
		expect(asset).toContain(`${middlewareDir.replaceAll("\\", "/")}/`);
		expect(readFileSync(asset).length).toBeGreaterThan(0);
	}
	expect(code).not.toMatch(/fallbackFont\s*=\s*fetch\(/);
});

test("proxy-only OG usage does not include OG assets in the server bundle", () => {
	const serverDir = path.join(outputDir, "server-functions/default");
	// Include both the root re-export and the actual handler in monorepo builds.
	const handlers = readdirSync(serverDir, { recursive: true }).filter(
		(entry) => path.basename(entry) === "handler.mjs"
	);
	expect(handlers.length).toBeGreaterThan(0);
	for (const handler of handlers) {
		const code = readFileSync(path.join(serverDir, handler), "utf-8");
		expect(code).not.toMatch(/resvg\.wasm|yoga\.wasm|\.ttf\.bin/);
	}
});
