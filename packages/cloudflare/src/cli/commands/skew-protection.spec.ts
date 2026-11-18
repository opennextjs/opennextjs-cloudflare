import { AuthenticationError, NotFoundError, PermissionDeniedError, RateLimitError } from "cloudflare";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CURRENT_VERSION_ID } from "../templates/skew-protection.js";
import { getDeploymentMapping, listWorkerVersions, updateDeploymentMapping } from "./skew-protection.js";

const { MockCloudflare, listVersions, getVersion } = vi.hoisted(() => {
	type Version = { id: string; metadata: { created_on: string } };
	const listVersions = vi.fn<() => Iterable<Version> | AsyncIterable<Version>>(() => []);
	const getVersion = vi.fn();

	class MockCloudflare {
		workers = {
			scripts: {
				versions: {
					list: listVersions,
					get: getVersion,
				},
			},
		};
	}

	return { MockCloudflare: vi.fn(MockCloudflare), listVersions, getVersion };
});

vi.mock("@opennextjs/aws/adapters/config/util.js", () => ({
	loadConfig: vi.fn(() => ({ deploymentId: "deployment-id" })),
}));

vi.mock("cloudflare", async (importOriginal) => {
	const original = await importOriginal<typeof import("cloudflare")>();
	return { ...original, Cloudflare: MockCloudflare };
});

describe("skew protection", () => {
	describe("getDeploymentMapping", () => {
		const getMapping = () =>
			getDeploymentMapping(
				{ appBuildOutputPath: "/tmp/app" } as never,
				{ cloudflare: { skewProtection: { enabled: true } } },
				{}
			);

		function rejectVersionList(error: Error) {
			listVersions.mockReturnValueOnce({
				[Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
			});
		}

		beforeEach(() => {
			vi.stubEnv("CF_WORKER_NAME", "worker-name");
			vi.stubEnv("CF_PREVIEW_DOMAIN", "example.workers.dev");
			vi.stubEnv("CF_WORKERS_SCRIPTS_API_TOKEN", "test-token");
			vi.stubEnv("CF_ACCOUNT_ID", "test-account-id");
		});

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		test("disables response compression for worker version requests", async () => {
			await expect(getMapping()).resolves.toEqual({ "deployment-id": CURRENT_VERSION_ID });

			expect(MockCloudflare).toHaveBeenCalledWith({
				apiToken: "test-token",
				defaultHeaders: { "Accept-Encoding": "identity" },
			});
		});

		test("explains which token to check when listing Worker versions returns HTTP 401", async () => {
			rejectVersionList(new AuthenticationError(401, undefined, "Authentication failed", {}));

			await expect(getMapping()).rejects.toMatchObject({
				message:
					"Skew protection could not read Worker versions (HTTP 401). Check that CF_WORKERS_SCRIPTS_API_TOKEN is valid and grants Workers Scripts:Read for CF_ACCOUNT_ID.",
			});
		});

		test("explains which permission to check when reading a Worker version returns HTTP 403", async () => {
			listVersions.mockReturnValueOnce([
				{ id: "previous", metadata: { created_on: new Date().toISOString() } },
			]);
			getVersion.mockRejectedValueOnce(new PermissionDeniedError(403, undefined, "Permission denied", {}));

			await expect(getMapping()).rejects.toMatchObject({
				message:
					"Skew protection could not read Worker versions (HTTP 403). Check that CF_WORKERS_SCRIPTS_API_TOKEN is valid and grants Workers Scripts:Read for CF_ACCOUNT_ID.",
			});
		});

		test("handles HTTP 404 from listing Worker versions as a first deployment", async () => {
			rejectVersionList(new NotFoundError(404, undefined, "Worker not found", {}));

			await expect(getMapping()).resolves.toEqual({ "deployment-id": CURRENT_VERSION_ID });
			expect(getVersion).not.toHaveBeenCalled();
		});

		test("preserves other Cloudflare API errors", async () => {
			const rateLimit = new RateLimitError(429, undefined, "Rate limited", {});
			rejectVersionList(rateLimit);

			await expect(getMapping()).rejects.toBe(rateLimit);
		});
	});

	describe("listWorkerVersions", () => {
		test("listWorkerVersions return versions ordered by time DESC", async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const client: any = {
				workers: {
					scripts: {
						versions: {
							list: () => [],
						},
					},
				},
			};

			const now = Date.now();

			client.workers.scripts.versions.list = vi.fn().mockReturnValue([
				{
					id: "HEAD",
					metadata: { created_on: new Date(now) },
				},
				{
					id: "HEAD~2",
					metadata: { created_on: new Date(now - 2000) },
				},
				{
					id: "HEAD~1",
					metadata: { created_on: new Date(now - 1000) },
				},
			]);

			expect(await listWorkerVersions("scriptName", { client, accountId: "accountId" })).toMatchObject([
				{
					createdOnMs: now,
					id: "HEAD",
				},
				{
					createdOnMs: now - 1000,
					id: "HEAD~1",
				},
				{
					createdOnMs: now - 2000,
					id: "HEAD~2",
				},
			]);
		});

		test("listWorkerVersions filters out non-upload-triggered versions", async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const client: any = {
				workers: {
					scripts: {
						versions: {
							list: () => [],
						},
					},
				},
			};

			const now = Date.now();

			client.workers.scripts.versions.list = vi.fn().mockReturnValue([
				{
					id: "secret-version",
					metadata: {
						created_on: new Date(now),
						annotations: { "workers/triggered_by": "secret" },
					},
				},
				{
					id: "upload-version",
					metadata: {
						created_on: new Date(now - 1000),
						annotations: { "workers/triggered_by": "upload" },
					},
				},
				{
					id: "version-upload",
					metadata: {
						created_on: new Date(now - 2000),
						annotations: { "workers/triggered_by": "version_upload" },
					},
				},
				{
					id: "legacy-no-annotation",
					metadata: { created_on: new Date(now - 3000) },
				},
			]);

			expect(await listWorkerVersions("scriptName", { client, accountId: "accountId" })).toMatchObject([
				{ id: "upload-version", createdOnMs: now - 1000 },
				{ id: "version-upload", createdOnMs: now - 2000 },
				{ id: "legacy-no-annotation", createdOnMs: now - 3000 },
			]);
		});

		test("listWorkerVersions returns [] when the newest versions are all secret-triggered", async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const client: any = {
				workers: {
					scripts: {
						versions: {
							list: () => [],
						},
					},
				},
			};

			const now = Date.now();

			client.workers.scripts.versions.list = vi.fn().mockReturnValue([
				{
					id: "secret-A",
					metadata: {
						created_on: new Date(now),
						annotations: { "workers/triggered_by": "secret" },
					},
				},
				{
					id: "secret-B",
					metadata: {
						created_on: new Date(now - 1000),
						annotations: { "workers/triggered_by": "secret" },
					},
				},
			]);

			expect(await listWorkerVersions("scriptName", { client, accountId: "accountId" })).toEqual([]);
		});
	});
});

describe("updateDeploymentMapping", () => {
	test("Update", () => {
		const mapping = {
			N: CURRENT_VERSION_ID,
			"N-1": "vN-1",
			"N-2": "vN-2",
		};
		const versions = [{ id: "vN" }, { id: "vN-1" }]; // "vN-2" is deleted
		expect(updateDeploymentMapping(mapping, versions, "N+1")).toMatchObject({
			"N+1": CURRENT_VERSION_ID,
			N: "vN",
			"N-1": "vN-1",
		});
	});
});
