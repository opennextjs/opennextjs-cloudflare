import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenNextConfigFile } from "./create-open-next-config.js";

describe("createOpenNextConfigFile", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "open-next-config-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should create the config file with cache enabled", () => {
		const result = createOpenNextConfigFile(tmpDir, { cache: true });

		expect(result).toBe(join(tmpDir, "open-next.config.ts"));
		expect(readFileSync(result, "utf8")).toMatchInlineSnapshot(`
			"// default open-next.config.ts file created by @opennextjs/cloudflare
			import { defineCloudflareConfig } from "@opennextjs/cloudflare";
			import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

			export default defineCloudflareConfig({
				incrementalCache: r2IncrementalCache,
			});
			"
		`);
	});

	it("should create the config file with cache disabled", () => {
		const result = createOpenNextConfigFile(tmpDir, { cache: false });

		expect(result).toBe(join(tmpDir, "open-next.config.ts"));
		expect(readFileSync(result, "utf8")).toMatchInlineSnapshot(`
			"// default open-next.config.ts file created by @opennextjs/cloudflare
			import { defineCloudflareConfig } from "@opennextjs/cloudflare";
			// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

			export default defineCloudflareConfig({
				// For best results consider enabling R2 caching
				// See https://opennext.js.org/cloudflare/caching for more details
				// incrementalCache: r2IncrementalCache
			});
			"
		`);
	});
});
