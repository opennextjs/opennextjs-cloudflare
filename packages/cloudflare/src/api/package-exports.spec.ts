import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import * as resolveExports from "resolve.exports";
import { describe, expect, test } from "vitest";

const packageJsonPath = path.join(import.meta.dirname, "../../package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

describe("package exports", () => {
	test.each([
		[".", "./dist/api/index.js"],
		["./config", "./dist/api/config.js"],
		["./overrides/queue/do-queue", "./dist/api/overrides/queue/do-queue.js"],
		["./package.json", "./package.json"],
	])("maps %s to %s", (entry, target) => {
		expect(resolveExports.exports(packageJson, entry)).toEqual([target]);
	});

	// TypeScript uses the first matching condition.
	test("lists the `types` condition first", () => {
		expect(Object.keys(packageJson.exports["."])[0]).toBe("types");
		expect(Object.keys(packageJson.exports["./*"])[0]).toBe("types");
	});

	test("resolves the package.json with Node", () => {
		const require = createRequire(import.meta.url);
		expect(require.resolve("@opennextjs/cloudflare/package.json")).toBe(packageJsonPath);
	});
});
