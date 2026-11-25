import { describe, expect, test } from "vitest";

import { defineCloudflareConfig } from "../../../api/config.js";
import { ensureCloudflareConfig } from "./ensure-cf-config.js";

const custom = async () => ({}) as never;

describe("ensureCloudflareConfig", () => {
	test.each([
		["dummy", "dummy"],
		["dummy", custom],
		[custom, "dummy"],
		[custom, custom],
	] as const)("accepts incrementalCache: %s with tagCache: %s", (incrementalCache, tagCache) => {
		expect(() =>
			ensureCloudflareConfig(defineCloudflareConfig({ incrementalCache, tagCache }))
		).not.toThrow();
	});

	test.each([
		["dummy", undefined],
		[custom, undefined],
		[custom, "dynamodb-lite"],
	] as const)("rejects incrementalCache: %s with tagCache: %s", (incrementalCache, tagCache) => {
		const config = defineCloudflareConfig({ incrementalCache });
		config.default.override!.tagCache = tagCache;

		expect(() => ensureCloudflareConfig(config)).toThrow(
			"The `open-next.config.ts` should have a default export like this"
		);
	});
});
