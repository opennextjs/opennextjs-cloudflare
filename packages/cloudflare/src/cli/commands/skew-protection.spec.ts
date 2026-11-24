import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CURRENT_VERSION_ID, DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import { getDeploymentMapping, listWorkerVersions, updateDeploymentMapping } from "./skew-protection.js";

const { MockCloudflare, versionsList, versionsGet } = vi.hoisted(() => {
	const versionsList = vi.fn((): unknown[] => []);
	const versionsGet = vi.fn();

	class MockCloudflare {
		workers = {
			scripts: {
				versions: {
					list: versionsList,
					get: versionsGet,
				},
			},
		};
	}

	return { MockCloudflare: vi.fn(MockCloudflare), versionsList, versionsGet };
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
			await expect(
				getDeploymentMapping(
					{ appBuildOutputPath: "/tmp/app" } as never,
					{ cloudflare: { skewProtection: { enabled: true } } },
					{}
				)
			).resolves.toEqual({ "deployment-id": CURRENT_VERSION_ID });

			expect(MockCloudflare).toHaveBeenCalledWith({
				apiToken: "test-token",
				defaultHeaders: { "Accept-Encoding": "identity" },
			});
		});

		test("reads the existing mapping from the latest deployed version", async () => {
			versionsList.mockReturnValueOnce([{ id: "version-1", metadata: { created_on: new Date() } }]);
			versionsGet.mockResolvedValueOnce({
				resources: {
					bindings: [
						{
							name: DEPLOYMENT_MAPPING_ENV_NAME,
							type: "plain_text",
							text: JSON.stringify({ "previous-deployment-id": CURRENT_VERSION_ID }),
						},
					],
				},
			});

			await expect(
				getDeploymentMapping(
					{ appBuildOutputPath: "/tmp/app" } as never,
					{ cloudflare: { skewProtection: { enabled: true } } },
					{}
				)
			).resolves.toEqual({
				"deployment-id": CURRENT_VERSION_ID,
				"previous-deployment-id": "version-1",
			});

			expect(versionsGet).toHaveBeenCalledWith("version-1", {
				account_id: "test-account-id",
				script_name: "worker-name",
			});
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
