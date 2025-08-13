import { describe, expect, it, vi } from "vitest";

import * as internal from "../overrides/internal.js";
import { BucketCachePurge } from "./bucket-cache-purge.js";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: CloudflareEnv
		) {}
	},
}));

const createBucketCachePurge = () => {
	const mockState = {
		waitUntil: vi.fn(),
		blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn()),
		storage: {
			setAlarm: vi.fn(),
			getAlarm: vi.fn(),
			sql: {
				exec: vi.fn().mockImplementation(() => ({
					one: vi.fn(),
					toArray: vi.fn().mockReturnValue([]),
				})),
			},
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new BucketCachePurge(mockState as any, {});
};

describe("BucketCachePurge", () => {
	it("should block concurrency while creating the table", async () => {
		const cache = createBucketCachePurge();
		// @ts-expect-error - testing private method
		expect(cache.ctx.blockConcurrencyWhile).toHaveBeenCalled();
		// @ts-expect-error - testing private method
		expect(cache.ctx.storage.sql.exec).toHaveBeenCalledWith(
			expect.stringContaining("CREATE TABLE IF NOT EXISTS cache_purge")
		);
	});

	describe("purgeCacheByTags", () => {
		it("should insert tags into the sql table", async () => {
			const cache = createBucketCachePurge();
			const tags = ["tag1", "tag2"];
			await cache.purgeCacheByTags(tags);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledWith(
				expect.stringContaining("INSERT OR REPLACE INTO cache_purge"),
				[tags[0]]
			);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledWith(
				expect.stringContaining("INSERT OR REPLACE INTO cache_purge"),
				[tags[1]]
			);
		});

		it("should set an alarm if no alarm is set", async () => {
			const cache = createBucketCachePurge();
			// @ts-expect-error - testing private method
			cache.ctx.storage.getAlarm.mockResolvedValueOnce(null);
			await cache.purgeCacheByTags(["tag"]);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.setAlarm).toHaveBeenCalled();
		});

		it("should not set an alarm if one is already set", async () => {
			const cache = createBucketCachePurge();
			// @ts-expect-error - testing private method
			cache.ctx.storage.getAlarm.mockResolvedValueOnce(true);
			await cache.purgeCacheByTags(["tag"]);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.setAlarm).not.toHaveBeenCalled();
		});
	});

	describe("alarm", () => {
		it("should purge cache by tags and delete them from the sql table", async () => {
			const cache = createBucketCachePurge();
			// @ts-expect-error - testing private method
			cache.ctx.storage.sql.exec.mockReturnValueOnce({
				toArray: () => [{ tag: "tag1" }, { tag: "tag2" }],
			});
			await cache.alarm();
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				["tag1", "tag2"]
			);
		});
		it("should not purge cache if no tags are found", async () => {
			const cache = createBucketCachePurge();
			// @ts-expect-error - testing private method
			cache.ctx.storage.sql.exec.mockReturnValueOnce({
				toArray: () => [],
			});
			await cache.alarm();
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).not.toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				[]
			);
		});

		it("should call internalPurgeCacheByTags with the correct tags", async () => {
			const cache = createBucketCachePurge();
			const tags = ["tag1", "tag2"];
			// @ts-expect-error - testing private method
			cache.ctx.storage.sql.exec.mockReturnValueOnce({
				toArray: () => tags.map((tag) => ({ tag })),
			});
			const internalPurgeCacheByTagsSpy = vi.spyOn(internal, "internalPurgeCacheByTags");
			await cache.alarm();
			expect(internalPurgeCacheByTagsSpy).toHaveBeenCalledWith(
				// @ts-expect-error - testing private method
				cache.env,
				tags
			);
			// @ts-expect-error - testing private method 1st is constructor, 2nd is to get the tags and 3rd is to delete them
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledTimes(3);
		});

		it("should continue until all tags are purged", async () => {
			const cache = createBucketCachePurge();
			const tags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
			// @ts-expect-error - testing private method
			cache.ctx.storage.sql.exec.mockReturnValueOnce({
				toArray: () => tags.map((tag) => ({ tag })),
			});
			const internalPurgeCacheByTagsSpy = vi.spyOn(internal, "internalPurgeCacheByTags");
			await cache.alarm();
			expect(internalPurgeCacheByTagsSpy).toHaveBeenCalledWith(
				// @ts-expect-error - testing private method
				cache.env,
				tags
			);
			// @ts-expect-error - testing private method 1st is constructor, 2nd is to get the tags and 3rd is to delete them, 4th is to get the next 100 tags
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledTimes(4);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).toHaveBeenLastCalledWith(
				expect.stringContaining("SELECT * FROM cache_purge LIMIT 100")
			);
		});
	});
});
