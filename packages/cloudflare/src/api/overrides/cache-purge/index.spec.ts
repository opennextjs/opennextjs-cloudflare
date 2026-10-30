import { error } from "@opennextjs/aws/adapters/logger.js";
import type { CDNPath } from "@opennextjs/aws/types/overrides.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { requestPurgeCacheByTags } from "../internal.js";
import purgeCache from "./index.js";

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
	error: vi.fn(),
}));

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("../internal.js", () => ({
	debugCache: vi.fn(),
	requestPurgeCacheByTags: vi.fn(),
}));

describe("purgeCache", () => {
	const env = {} as CloudflareEnv;

	beforeEach(() => {
		vi.mocked(error).mockClear();
		vi.mocked(getCloudflareContext).mockReturnValue({ env } as ReturnType<typeof getCloudflareContext>);
		vi.mocked(requestPurgeCacheByTags).mockResolvedValue({ status: "purge-success" });
	});

	it("invalidates tags directly", async () => {
		const idFromName = vi.fn();
		vi.mocked(getCloudflareContext).mockReturnValue({
			env: { NEXT_CACHE_DO_PURGE: { idFromName } },
		} as unknown as ReturnType<typeof getCloudflareContext>);

		await purgeCache({ type: "direct" }).invalidateTags?.(["tag-1", "tag-2"]);

		expect(requestPurgeCacheByTags).toHaveBeenCalledWith(
			expect.objectContaining({ NEXT_CACHE_DO_PURGE: expect.anything() }),
			["tag-1", "tag-2"]
		);
		expect(idFromName).not.toHaveBeenCalled();
	});

	it.each(["missing-credentials", "rate-limit-exceeded", "purge-failed"] as const)(
		"rejects direct invalidation when the purge returns %s",
		async (result) => {
			vi.mocked(requestPurgeCacheByTags).mockResolvedValueOnce({ status: result, message: "details" });

			await expect(purgeCache({ type: "direct" }).invalidateTags?.(["tag-1"])).rejects.toThrow(
				`Cloudflare cache purge failed: ${result} - details`
			);
		}
	);

	it("converts paths to tags before direct invalidation", async () => {
		const paths: CDNPath[] = [
			{ initialPath: "/first", rawPath: "/first", resolvedRoutes: [] },
			{ initialPath: "/second", rawPath: "/second", resolvedRoutes: [] },
		];
		await purgeCache({ type: "direct" }).invalidatePaths(paths);

		expect(requestPurgeCacheByTags).toHaveBeenCalledWith(env, ["_N_T_/first", "_N_T_/second"]);
	});

	it("invalidates tags through the Durable Object", async () => {
		const purgeCacheByTags = vi.fn();
		const get = vi.fn().mockReturnValue({ purgeCacheByTags });
		const idFromName = vi.fn().mockReturnValue("cache-purge-id");
		vi.mocked(getCloudflareContext).mockReturnValue({
			env: { NEXT_CACHE_DO_PURGE: { idFromName, get } },
		} as unknown as ReturnType<typeof getCloudflareContext>);

		await purgeCache({ type: "durableObject" }).invalidateTags?.(["tag-1"]);

		expect(idFromName).toHaveBeenCalledWith("cache-purge");
		expect(get).toHaveBeenCalledWith("cache-purge-id");
		expect(purgeCacheByTags).toHaveBeenCalledWith(["tag-1"]);
	});

	it("skips the purge and logs an error when the Durable Object binding is missing", async () => {
		await purgeCache({ type: "durableObject" }).invalidateTags?.(["tag-1"]);

		expect(requestPurgeCacheByTags).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(expect.stringContaining("NEXT_CACHE_DO_PURGE not found"));
	});

	it("skips path invalidation when the Durable Object binding is missing", async () => {
		const paths: CDNPath[] = [{ initialPath: "/first", rawPath: "/first", resolvedRoutes: [] }];
		await purgeCache({ type: "durableObject" }).invalidatePaths(paths);

		expect(requestPurgeCacheByTags).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(expect.stringContaining("NEXT_CACHE_DO_PURGE not found"));
	});

	it("does not log about the Durable Object binding in direct mode", async () => {
		await purgeCache({ type: "direct" }).invalidateTags?.(["tag-1"]);

		expect(error).not.toHaveBeenCalled();
	});
});
