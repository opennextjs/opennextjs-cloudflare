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
	test("accepts the config of defineCloudflareConfig with the default caches", () => {
		expect(() => ensureCloudflareConfig(defineCloudflareConfig())).not.toThrow();
	});

	test("accepts the config of defineCloudflareConfig with custom caches", () => {
		expect(() =>
			ensureCloudflareConfig(
				defineCloudflareConfig({ incrementalCache: lazyOverride, tagCache: lazyOverride })
			)
		).not.toThrow();
	});

	test.each([
		["dummy", "dummy", "dummy", "dummy"],
		["dummy", "a function", "dummy", lazyOverride],
		["a function", "dummy", lazyOverride, "dummy"],
		["a function", "a function", lazyOverride, lazyOverride],
	] as const)("accepts incrementalCache: %s with tagCache: %s", (_, __, incrementalCache, tagCache) => {
		expect(() => ensureCloudflareConfig(buildConfig({ incrementalCache, tagCache }))).not.toThrow();
	});

	test.each([
		["dummy", "unset", "dummy", undefined],
		["a function", "unset", lazyOverride, undefined],
		["a function", "dynamodb-lite", lazyOverride, "dynamodb-lite"],
	] as const)("rejects incrementalCache: %s with tagCache: %s", (_, __, incrementalCache, tagCache) => {
		expect(() => ensureCloudflareConfig(buildConfig({ incrementalCache, tagCache }))).toThrow(
			"The `open-next.config.ts` should have a default export like this"
		);
	});
});
