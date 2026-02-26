import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWrangler } from "../commands/utils/run-wrangler.js";
import { createWranglerConfigFile } from "./create-wrangler-config.js";

const { MockNotFoundError, mockR2BucketsGet, mockR2BucketsCreate } = vi.hoisted(() => {
	class MockNotFoundError extends Error {}
	return {
		MockNotFoundError,
		mockR2BucketsGet: vi.fn(),
		mockR2BucketsCreate: vi.fn(),
	};
});

// Mock findPackagerAndRoot
vi.mock("@opennextjs/aws/build/helper.js", () => ({
	findPackagerAndRoot: vi.fn(() => ({ packager: "pnpm", root: "/tmp" })),
}));

// Mock runWrangler
vi.mock("../commands/utils/run-wrangler.js", () => ({
	runWrangler: vi.fn(),
}));

// Mock cloudflare SDK
vi.mock("cloudflare", () => {
	const MockCloudflare = vi.fn(() => ({
		accounts: { list: vi.fn(() => []) },
		r2: {
			buckets: {
				get: mockR2BucketsGet,
				create: mockR2BucketsCreate,
			},
		},
	}));
	MockCloudflare.NotFoundError = MockNotFoundError;
	return { default: MockCloudflare };
});

// Mock askAccountSelection (imported by the module but not reached in our tests)
vi.mock("./ask-account-selection.js", () => ({
	askAccountSelection: vi.fn(),
}));

describe("createWranglerConfigFile", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wrangler-config-test-"));
		writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ name: "next-app" }));
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account-id");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				json: () => Promise.resolve({ "dist-tags": { latest: "1.20250101.0" } }),
			})
		);
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("should create config with caching enabled", async () => {
		// Auth succeeds
		vi.mocked(runWrangler).mockReturnValue({
			success: true,
			stdout: JSON.stringify({ type: "oauth", token: "test-token" }),
			stderr: "",
		});
		// Bucket doesn't exist yet → create it
		mockR2BucketsGet.mockRejectedValue(new MockNotFoundError("not found"));
		mockR2BucketsCreate.mockResolvedValue({});

		const result = await createWranglerConfigFile(tmpDir);

		expect(result).toEqual({ cachingEnabled: true });
		expect(readFileSync(join(tmpDir, "wrangler.jsonc"), "utf8")).toMatchInlineSnapshot(`
			"{
				"$schema": "node_modules/wrangler/config-schema.json",
				"main": ".open-next/worker.js",
				"name": "next-app",
				"compatibility_date": "2025-01-01",
				"compatibility_flags": [
					"nodejs_compat",
					"global_fetch_strictly_public"
				],
				"assets": {
					"directory": ".open-next/assets",
					"binding": "ASSETS"
				},
				"services": [
					{
						// Self-reference service binding, the service name must match the worker name
						// see https://opennext.js.org/cloudflare/caching
						"binding": "WORKER_SELF_REFERENCE",
						"service": "next-app"
					}
				],
				"r2_buckets": [
					// Use R2 incremental cache
					// See https://opennext.js.org/cloudflare/caching
					{
						"binding": "NEXT_INC_CACHE_R2_BUCKET",
						// Create the bucket before deploying
						// You can change the bucket name if you want
						// See https://developers.cloudflare.com/workers/wrangler/commands/#r2-bucket-create
						"bucket_name": "next-app-opennext-cache"
					}
				],
				"images": {
					// Enable image optimization
					// see https://opennext.js.org/cloudflare/howtos/image
					"binding": "IMAGES"
				}
			}"
		`);
	});

	it("should create config with caching disabled", async () => {
		// Auth fails → maybeCreateR2Bucket returns { success: false }
		vi.mocked(runWrangler).mockReturnValue({
			success: false,
			stdout: "",
			stderr: "",
		});

		const result = await createWranglerConfigFile(tmpDir);

		expect(result).toEqual({ cachingEnabled: false });
		expect(readFileSync(join(tmpDir, "wrangler.jsonc"), "utf8")).toMatchInlineSnapshot(`
			"{
				"$schema": "node_modules/wrangler/config-schema.json",
				"main": ".open-next/worker.js",
				"name": "next-app",
				"compatibility_date": "2025-01-01",
				"compatibility_flags": [
					"nodejs_compat",
					"global_fetch_strictly_public"
				],
				"assets": {
					"directory": ".open-next/assets",
					"binding": "ASSETS"
				},
				"services": [
					{
						// Self-reference service binding, the service name must match the worker name
						// see https://opennext.js.org/cloudflare/caching
						"binding": "WORKER_SELF_REFERENCE",
						"service": "next-app"
					}
				],
				"images": {
					// Enable image optimization
					// see https://opennext.js.org/cloudflare/howtos/image
					"binding": "IMAGES"
				}
			}"
		`);
	});
});
