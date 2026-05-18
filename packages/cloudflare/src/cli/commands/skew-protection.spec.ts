import { describe, expect, test, vi } from "vitest";

import { CURRENT_VERSION_ID } from "../templates/skew-protection.js";
import { listWorkerVersions, updateDeploymentMapping } from "./skew-protection.js";

describe("skew protection", () => {
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
