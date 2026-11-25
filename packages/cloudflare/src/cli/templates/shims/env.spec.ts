import { describe, expect, test } from "vitest";

import nextEnv, { loadEnvConfig } from "./env.js";

describe("@next/env shim", () => {
	test("loadEnvConfig returns the env without loading any file", () => {
		expect(loadEnvConfig()).toEqual({
			combinedEnv: process.env,
			parsedEnv: undefined,
			loadedEnvFiles: [],
		});
	});

	// Payload 3.x `bin/loadEnv.js` uses a default import and destructures the result
	test("supports the default import used by Payload", () => {
		const { loadEnvConfig } = nextEnv;
		const { loadedEnvFiles } = loadEnvConfig();

		expect(loadedEnvFiles).toEqual([]);
	});
});
