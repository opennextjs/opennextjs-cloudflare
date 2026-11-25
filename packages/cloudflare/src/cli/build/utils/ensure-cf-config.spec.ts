import { describe, expect, test } from "vitest";

import { defineCloudflareConfig, type OpenNextConfig } from "../../../api/config.js";
import { ensureCloudflareConfig } from "./ensure-cf-config.js";

const lazyOverride = async () => ({}) as never;

/**
 * Builds a hand-written config that satisfies every requirement but the cache overrides.
 *
 * @param caches The cache overrides of the default function.
 * @returns The OpenNext configuration.
 */
function buildConfig(
	caches: Pick<NonNullable<OpenNextConfig["default"]["override"]>, "incrementalCache" | "tagCache">
): OpenNextConfig {
	return {
		default: {
			override: {
				wrapper: "cloudflare-node",
				converter: "edge",
				proxyExternalRequest: "fetch",
				queue: "dummy",
				...caches,
			},
		},
		edgeExternals: ["node:crypto"],
		middleware: {
			external: true,
			override: {
				wrapper: "cloudflare-edge",
				converter: "edge",
				proxyExternalRequest: "fetch",
			},
		},
	};
}

describe("ensureCloudflareConfig", () => {
	test("accepts the config of defineCloudflareConfig", () => {
		expect(() => ensureCloudflareConfig(defineCloudflareConfig())).not.toThrow();
	});

	test.each([
		["dummy", "dummy", "dummy", "dummy"],
		["dummy", "dummy", "a function", lazyOverride],
		["a function", lazyOverride, "dummy", "dummy"],
		["a function", lazyOverride, "a function", lazyOverride],
	] as const)("accepts incrementalCache: %s with tagCache: %s", (_, incrementalCache, __, tagCache) => {
		expect(() => ensureCloudflareConfig(buildConfig({ incrementalCache, tagCache }))).not.toThrow();
	});

	test.each([
		["dummy", "dummy", "unset", undefined],
		["a function", lazyOverride, "unset", undefined],
		["a function", lazyOverride, "dynamodb-lite", "dynamodb-lite"],
	] as const)("rejects incrementalCache: %s with tagCache: %s", (_, incrementalCache, __, tagCache) => {
		expect(() => ensureCloudflareConfig(buildConfig({ incrementalCache, tagCache }))).toThrow(
			"The `open-next.config.ts` should have a default export like this"
		);
	});
});
