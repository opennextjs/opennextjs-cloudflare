import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { describe, expect, test } from "vitest";

import { needsExperimentalReact, usesCacheComponents } from "./next-config.js";

describe("needsExperimentalReact", () => {
	test.each(["ppr", "taint", "viewTransition"])("returns true when experimental.%s is enabled", (flag) => {
		expect(needsExperimentalReact({ experimental: { [flag]: true } } as unknown as NextConfig)).toBe(true);
	});

	test("returns false when no flag is enabled", () => {
		expect(needsExperimentalReact({ experimental: {} } as unknown as NextConfig)).toBe(false);
	});
});

describe("usesCacheComponents", () => {
	test.each([
		["cacheComponents", { cacheComponents: true }],
		["experimental.cacheComponents", { experimental: { cacheComponents: true } }],
		["experimental.dynamicIO", { experimental: { dynamicIO: true } }],
	])("returns true when %s is enabled", (_, config) => {
		expect(usesCacheComponents(config as unknown as NextConfig)).toBe(true);
	});

	test.each([
		["no flag is set", { experimental: {} }],
		["experimental is missing", {}],
		["cacheComponents is false", { cacheComponents: false, experimental: { cacheComponents: false } }],
	])("returns false when %s", (_, config) => {
		expect(usesCacheComponents(config as unknown as NextConfig)).toBe(false);
	});
});
