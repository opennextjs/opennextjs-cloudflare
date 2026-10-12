import { describe, expect, it, vi } from "vitest";

import * as internal from "../overrides/internal.js";
import { BucketCachePurge, BucketCachePurgeBase, type CachePurgeAction } from "./bucket-cache-purge.js";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: CloudflareEnv
		) {}
	},
}));

const createCachePurge = <T>(
	CachePurge: new (state: DurableObjectState, env: CloudflareEnv) => T,
	options: { runConstructorInitialization?: boolean } = {}
): T => {
	const { runConstructorInitialization = true } = options;
	const mockState = {
		waitUntil: vi.fn(),
		blockConcurrencyWhile: runConstructorInitialization
			? vi.fn().mockImplementation(async (fn) => fn())
			: vi.fn(),
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
	return new CachePurge(mockState as any, {});
};

const createBucketCachePurge = () => createCachePurge(BucketCachePurge);

const setTagBatches = (cache: BucketCachePurge, batches: string[][]) => {
	// @ts-expect-error - testing private method
	cache.ctx.storage.sql.exec.mockImplementation((query: string) => ({
		one: vi.fn(),
		toArray: () =>
			query.includes("SELECT tag FROM cache_purge") ? (batches.shift() ?? []).map((tag) => ({ tag })) : [],
	}));
};

describe("BucketCachePurge", () => {
	it("should initialize storage behind the constructor input gate", async () => {
		const cache = createBucketCachePurge();

		await cache.purgeCacheByTags([]);

		// @ts-expect-error - testing private method
		expect(cache.ctx.blockConcurrencyWhile).toHaveBeenCalledOnce();
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
				tags[0]
			);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledWith(
				expect.stringContaining("INSERT OR REPLACE INTO cache_purge"),
				tags[1]
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
		it("should allow subclasses to override purge execution", async () => {
			const executePurge = vi.fn().mockResolvedValue("purge-success");
			class CustomBucketCachePurge extends BucketCachePurge {
				protected override executePurge(tags: string[]) {
					return executePurge(tags);
				}
			}
			const cache = createCachePurge(CustomBucketCachePurge);
			const tags = ["tag1", "tag2"];
			setTagBatches(cache, [tags]);

			await cache.alarm();

			expect(executePurge).toHaveBeenCalledWith(tags);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				...tags
			);
		});

		it("should retain tags when custom execution throws", async () => {
			class FailingBucketCachePurge extends BucketCachePurge {
				protected override async executePurge() {
					throw new Error("Custom purge failed");
				}
			}
			const cache = createCachePurge(FailingBucketCachePurge);
			setTagBatches(cache, [["tag1"]]);

			await expect(cache.alarm()).rejects.toThrow("Custom purge failed");
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).not.toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				"tag1"
			);
		});

		it("should retain tags and throw when custom execution is rate limited", async () => {
			class RateLimitedBucketCachePurge extends BucketCachePurge {
				protected override async executePurge() {
					return "rate-limit-exceeded" as const;
				}
			}
			const cache = createCachePurge(RateLimitedBucketCachePurge);
			setTagBatches(cache, [["tag1"]]);

			await expect(cache.alarm()).rejects.toThrow("Rate limit exceeded");
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).not.toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				"tag1"
			);
		});

		it("should purge cache by tags and delete them from the sql table", async () => {
			const cache = createBucketCachePurge();
			setTagBatches(cache, [["tag1", "tag2"]]);
			await cache.alarm();
			// SqlStorage.exec(query, ...bindings) is variadic: each placeholder needs
			// its own binding argument. Passing the tags as a single array made the
			// binding count (1) disagree with the placeholder count (N), so exec threw
			// "Wrong number of parameter bindings" and the purge never ran (#1288). The
			// bindings must be spread.
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				"tag1",
				"tag2"
			);
			// @ts-expect-error - testing private method
			expect(cache.ctx.storage.sql.exec).not.toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				["tag1", "tag2"]
			);
		});
		it("should not purge cache if no tags are found", async () => {
			const cache = createBucketCachePurge();
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
			setTagBatches(cache, [tags]);
			const internalPurgeCacheByTagsSpy = vi.spyOn(internal, "internalPurgeCacheByTags");
			await cache.alarm();
			expect(internalPurgeCacheByTagsSpy).toHaveBeenCalledWith(
				// @ts-expect-error - testing private method
				cache.env,
				tags
			);
			// @ts-expect-error - testing private method: initialize, load, delete, then load again
			expect(cache.ctx.storage.sql.exec).toHaveBeenCalledTimes(4);
		});

		it("should continue until all tags are purged", async () => {
			const cache = createBucketCachePurge();
			const tags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
			setTagBatches(cache, [tags]);
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
				expect.stringContaining("SELECT tag FROM cache_purge LIMIT 100")
			);
		});
	});
});

describe("BucketCachePurgeBase", () => {
	it("should retry storage initialization after a failure", async () => {
		const initializeStorage = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(new Error("Initialization failed"))
			.mockResolvedValue();

		class RetriableInitializationCachePurge extends BucketCachePurgeBase<string[], void> {
			protected override initializeStorage() {
				return initializeStorage();
			}

			protected override async enqueueTags() {}

			protected override async loadNextBatch() {
				return undefined;
			}

			protected override async executePurge() {}

			protected override async settleBatch() {
				return "continue" as const;
			}
		}

		const cache = createCachePurge(RetriableInitializationCachePurge, {
			runConstructorInitialization: false,
		});

		await expect(cache.purgeCacheByTags(["tag1"])).rejects.toThrow("Initialization failed");
		await cache.purgeCacheByTags(["tag1"]);

		expect(initializeStorage).toHaveBeenCalledTimes(2);
	});

	it("should support a custom storage schema and batch lifecycle", async () => {
		type Batch = { tagsByZone: Record<string, string[]> };
		type Result = { rateLimitedZones: string[] };
		const batch: Batch = { tagsByZone: { zoneA: ["tag1"] } };
		const result: Result = { rateLimitedZones: [] };
		const initializeStorage = vi.fn<() => Promise<void>>().mockResolvedValue();
		const enqueueTags = vi.fn<(tags: string[]) => Promise<void>>().mockResolvedValue();
		const loadNextBatch = vi
			.fn<(limit: number) => Promise<Batch | undefined>>()
			.mockResolvedValueOnce(batch)
			.mockResolvedValueOnce(undefined);
		const executePurge = vi.fn<(batch: Batch) => Promise<Result>>().mockResolvedValue(result);
		const settleBatch = vi
			.fn<(batch: Batch, result: Result) => Promise<CachePurgeAction>>()
			.mockResolvedValue("continue");

		class CustomSchemaCachePurge extends BucketCachePurgeBase<Batch, Result> {
			protected override initializeStorage() {
				return initializeStorage();
			}

			protected override enqueueTags(tags: string[]) {
				return enqueueTags(tags);
			}

			protected override loadNextBatch(limit: number) {
				return loadNextBatch(limit);
			}

			protected override executePurge(loadedBatch: Batch) {
				return executePurge(loadedBatch);
			}

			protected override settleBatch(loadedBatch: Batch, purgeResult: Result) {
				return settleBatch(loadedBatch, purgeResult);
			}
		}

		const cache = createCachePurge(CustomSchemaCachePurge);
		await cache.purgeCacheByTags(["tag1"]);
		await cache.alarm();

		expect(initializeStorage).toHaveBeenCalledOnce();
		expect(enqueueTags).toHaveBeenCalledWith(["tag1"]);
		expect(loadNextBatch).toHaveBeenNthCalledWith(1, 100);
		expect(loadNextBatch).toHaveBeenNthCalledWith(2, 100);
		expect(executePurge).toHaveBeenCalledWith(batch);
		expect(settleBatch).toHaveBeenCalledWith(batch, result);
		// @ts-expect-error - testing private method
		expect(cache.ctx.storage.setAlarm).toHaveBeenCalledOnce();
	});
});
