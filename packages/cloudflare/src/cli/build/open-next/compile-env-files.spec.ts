import { readFileSync } from "node:fs";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compileEnvFiles } from "./compile-env-files.js";

const options = { monorepoRoot: "", appPath: "", outputDir: ".open-next" } as BuildOptions;

describe("compileEnvFiles", () => {
	beforeEach(() => {
		mockFs({
			".env": "ENV_VAR=value",
			".env.test": "ENV_TEST_VAR=value",
			".env.development": "ENV_DEV_VAR=value",
			".env.production": "ENV_PROD_VAR=value",
		});
	});

	afterEach(() => mockFs.restore());

	it("should write one export per mode", () => {
		compileEnvFiles(options);

		expect(readFileSync(".open-next/cloudflare/next-env.mjs", "utf-8")).toMatchInlineSnapshot(`
			"export const production = {"ENV_VAR":"value","ENV_PROD_VAR":"value"};
			export const development = {"ENV_VAR":"value","ENV_DEV_VAR":"value"};
			export const test = {"ENV_VAR":"value","ENV_TEST_VAR":"value"};
			"
		`);
	});

	// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1274
	it("should write the same content when called twice", () => {
		compileEnvFiles(options);
		compileEnvFiles(options);

		expect(readFileSync(".open-next/cloudflare/next-env.mjs", "utf-8")).toMatchInlineSnapshot(`
			"export const production = {"ENV_VAR":"value","ENV_PROD_VAR":"value"};
			export const development = {"ENV_VAR":"value","ENV_DEV_VAR":"value"};
			export const test = {"ENV_VAR":"value","ENV_TEST_VAR":"value"};
			"
		`);
	});
});
