import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { internalPurgeCacheByTags, purgeZone } from "../overrides/internal.js";
import type { BucketCachePurge } from "./bucket-cache-purge.js";

declare global {
	namespace Cloudflare {
		interface Env {
			BUCKET_CACHE_PURGE: DurableObjectNamespace<BucketCachePurge>;
			CACHE_PURGE_ZONE_ID: string;
			CACHE_PURGE_API_TOKEN: string;
		}
	}
}

vi.mock("../overrides/internal.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../overrides/internal.js")>();
	return { ...actual, internalPurgeCacheByTags: vi.fn(), purgeZone: vi.fn() };
});

/**
 * Helper to return a fresh DO instance per-test.
 */
function getDOStub() {
	// newUniqueId() - Creates a randomly generated and unique DurableObjectId, which refers to an individual instance of the Durable Object class
	// get(id) - Returns a DurableObjectStub for that ID.
	// The stub is a proxy. The actual Durable Object instance is created on the first request to the stub.
	const id = env.BUCKET_CACHE_PURGE.newUniqueId();
	return env.BUCKET_CACHE_PURGE.get(id);
}

async function getTags(stub: DurableObjectStub<BucketCachePurge>) {
	return runInDurableObject(stub, (_instance, state) => {
		const rows = state.storage.sql.exec("SELECT tag FROM cache_purge ORDER BY tag").toArray();
		return rows.map((row) => row.tag);
	});
}

async function getPendingPurges(stub: DurableObjectStub<BucketCachePurge>) {
	return runInDurableObject(stub, (_instance, state) => {
		return state.storage.sql.exec("SELECT tag, zone_id FROM pending_purges ORDER BY zone_id, tag").toArray();
	});
}

describe("BucketCachePurge", () => {
	beforeEach(() => {
		vi.mocked(internalPurgeCacheByTags).mockResolvedValue({ status: "purge-success", rateLimitedZones: [] });
		vi.mocked(purgeZone).mockResolvedValue({ zoneId: "any", status: "purge-success" });
	});

	it("should create the tables on construction", async () => {
		const stub = getDOStub();

		const tables = await runInDurableObject(stub, (_instance, state) => {
			return state.storage.sql
				.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
				.toArray();
		});

		expect(tables).toStrictEqual([{ name: "cache_purge" }, { name: "pending_purges" }]);
	});

	describe("purgeCacheByTags", () => {
		it("should insert tags into the sql table", async () => {
			const stub = getDOStub();

			await stub.purgeCacheByTags(["tag1", "tag2"]);

			const tags = await getTags(stub);
			expect(tags).toEqual(["tag1", "tag2"]);
		});

		it("should set an alarm if no alarm is set", async () => {
			const stub = getDOStub();

			await stub.purgeCacheByTags(["tag"]);

			const alarm = await runInDurableObject(stub, async (_instance, state) => {
				return state.storage.getAlarm();
			});

			expect(alarm).not.toBeNull();
		});

		it("should not set an alarm if one is already set", async () => {
			const stub = getDOStub();

			// Manually set an alarm via runInDurableObject
			const originalAlarm = await runInDurableObject(stub, async (_instance, state) => {
				const alarmTime = Date.now() + 60_000;
				state.storage.setAlarm(alarmTime);
				return alarmTime;
			});

			await stub.purgeCacheByTags(["tag"]);

			const currentAlarm = await runInDurableObject(stub, async (_instance, state) => {
				return state.storage.getAlarm();
			});

			expect(currentAlarm).toBe(originalAlarm);
		});
	});

	describe("alarm", () => {
		it("should purge cache by tags and delete them from the sql table", async () => {
			const stub = getDOStub();

			await stub.purgeCacheByTags(["tag1", "tag2"]);
			expect(await getTags(stub)).toEqual(["tag1", "tag2"]);

			await runDurableObjectAlarm(stub);

			expect(await getTags(stub)).toEqual([]);
		});

		it("should not purge cache if no tags are found", async () => {
			const stub = getDOStub();

			await runInDurableObject(stub, async (_instance, state) => {
				state.storage.setAlarm(Date.now() + 1000);
			});

			await runDurableObjectAlarm(stub);

			expect(internalPurgeCacheByTags).not.toHaveBeenCalled();
		});

		it("should call internalPurgeCacheByTags with the correct tags and zone IDs", async () => {
			const stub = getDOStub();

			await stub.purgeCacheByTags(["tag1", "tag2"]);
			await runDurableObjectAlarm(stub);

			expect(internalPurgeCacheByTags).toHaveBeenCalledWith(
				env,
				["tag1", "tag2"],
				["test-zone-a", "test-zone-b"]
			);
			expect(internalPurgeCacheByTags).toHaveBeenCalledOnce();
		});

		it("should continue until all tags are purged", async () => {
			const stub = getDOStub();

			const tags = Array.from({ length: 150 }, (_, i) => `tag${String(i).padStart(3, "0")}`);
			await stub.purgeCacheByTags(tags);
			expect(await getTags(stub)).toHaveLength(150);

			await runDurableObjectAlarm(stub);

			// Two batches: first 100 tags, then the remaining 50
			expect(internalPurgeCacheByTags).toHaveBeenCalledTimes(2);
			expect(await getTags(stub)).toEqual([]);
		});

		it("should throw on rate-limit and move tags from cache_purge to pending_purges", async () => {
			vi.mocked(internalPurgeCacheByTags).mockResolvedValue({
				status: "rate-limit-exceeded",
				rateLimitedZones: ["test-zone-b"],
			});

			const stub = getDOStub();

			await stub.purgeCacheByTags(["tag1", "tag2"]);
			await expect(runDurableObjectAlarm(stub)).rejects.toThrow("Rate limit exceeded");

			// Tags are moved out of cache_purge.
			expect(await getTags(stub)).toEqual([]);

			// Only the rate-limited zone has entries in pending_purges.
			const pending = await getPendingPurges(stub);
			expect(pending).toEqual([
				{ tag: "tag1", zone_id: "test-zone-b" },
				{ tag: "tag2", zone_id: "test-zone-b" },
			]);
		});

		it("should retry pending purges using purgeZone with per-zone tag sets", async () => {
			const stub = getDOStub();

			// Seed pending_purges to simulate a previous rate-limited alarm.
			// Tags have already been moved out of cache_purge.
			await runInDurableObject(stub, (_instance, state) => {
				state.storage.sql.exec(
					"INSERT INTO pending_purges (tag, zone_id) VALUES ('tag1', 'zone-x'), ('tag2', 'zone-x'), ('tag1', 'zone-y')"
				);
				state.storage.setAlarm(Date.now() + 1000);
			});

			await runDurableObjectAlarm(stub);

			// purgeZone is called per zone with that zone's tags.
			expect(purgeZone).toHaveBeenCalledWith(env, "zone-x", ["tag1", "tag2"]);
			expect(purgeZone).toHaveBeenCalledWith(env, "zone-y", ["tag1"]);
			expect(purgeZone).toHaveBeenCalledTimes(2);

			// After success, pending_purges is cleaned up.
			expect(await getPendingPurges(stub)).toEqual([]);
		});

		it("should keep rate-limited zone pairs and remove succeeded ones on retry", async () => {
			const stub = getDOStub();

			await runInDurableObject(stub, (_instance, state) => {
				state.storage.sql.exec(
					"INSERT INTO pending_purges (tag, zone_id) VALUES ('tag1', 'zone-x'), ('tag1', 'zone-y')"
				);
				state.storage.setAlarm(Date.now() + 1000);
			});

			vi.mocked(purgeZone)
				.mockResolvedValueOnce({ zoneId: "zone-x", status: "purge-success" })
				.mockResolvedValueOnce({ zoneId: "zone-y", status: "rate-limit-exceeded" });

			await expect(runDurableObjectAlarm(stub)).rejects.toThrow("Rate limit exceeded");

			// zone-x pairs are removed, zone-y pairs remain.
			const pending = await getPendingPurges(stub);
			expect(pending).toEqual([{ tag: "tag1", zone_id: "zone-y" }]);
		});

		it("should not re-purge tags added during retry against already-succeeded zones", async () => {
			const stub = getDOStub();

			// Simulate: previous alarm rate-limited test-zone-b for tag1.
			// tag1 was moved from cache_purge to pending_purges.
			// Meanwhile, tag2 was added to cache_purge by a new request.
			await runInDurableObject(stub, (_instance, state) => {
				state.storage.sql.exec("INSERT INTO pending_purges (tag, zone_id) VALUES ('tag1', 'test-zone-b')");
				state.storage.sql.exec("INSERT INTO cache_purge (tag) VALUES ('tag2')");
				state.storage.setAlarm(Date.now() + 1000);
			});

			await runDurableObjectAlarm(stub);

			// purgeZone retried only tag1 against test-zone-b.
			expect(purgeZone).toHaveBeenCalledTimes(1);
			expect(purgeZone).toHaveBeenCalledWith(env, "test-zone-b", ["tag1"]);

			// internalPurgeCacheByTags processed tag2 (the new tag) against all zones.
			expect(internalPurgeCacheByTags).toHaveBeenCalledWith(env, ["tag2"], ["test-zone-a", "test-zone-b"]);

			// Both tables are empty.
			expect(await getTags(stub)).toEqual([]);
			expect(await getPendingPurges(stub)).toEqual([]);
		});

		it("should still delete tags from cache_purge on purge-failed", async () => {
			vi.mocked(internalPurgeCacheByTags).mockResolvedValue({
				status: "purge-failed",
				rateLimitedZones: [],
			});

			const stub = getDOStub();

			await stub.purgeCacheByTags(["tag1", "tag2"]);
			await runDurableObjectAlarm(stub);

			// Tags are deleted.
			expect(await getTags(stub)).toEqual([]);
			// No pending_purges entries are created.
			expect(await getPendingPurges(stub)).toEqual([]);
		});

		it("should store pairs for all rate-limited zones when multiple zones fail", async () => {
			vi.mocked(internalPurgeCacheByTags).mockResolvedValue({
				status: "rate-limit-exceeded",
				rateLimitedZones: ["test-zone-a", "test-zone-b"],
			});

			const stub = getDOStub();

			await stub.purgeCacheByTags(["tag1"]);
			await expect(runDurableObjectAlarm(stub)).rejects.toThrow("Rate limit exceeded");

			// Tags are moved out of cache_purge.
			expect(await getTags(stub)).toEqual([]);

			const pending = await getPendingPurges(stub);
			expect(pending).toEqual([
				{ tag: "tag1", zone_id: "test-zone-a" },
				{ tag: "tag1", zone_id: "test-zone-b" },
			]);
		});

		it("should throw again when all zones are still rate-limited on retry", async () => {
			const stub = getDOStub();

			await runInDurableObject(stub, (_instance, state) => {
				state.storage.sql.exec(
					"INSERT INTO pending_purges (tag, zone_id) VALUES ('tag1', 'zone-x'), ('tag1', 'zone-y')"
				);
				state.storage.setAlarm(Date.now() + 1000);
			});

			vi.mocked(purgeZone)
				.mockResolvedValueOnce({ zoneId: "zone-x", status: "rate-limit-exceeded" })
				.mockResolvedValueOnce({ zoneId: "zone-y", status: "rate-limit-exceeded" });

			await expect(runDurableObjectAlarm(stub)).rejects.toThrow("Rate limit exceeded");

			// All pairs remain for the next retry.
			const pending = await getPendingPurges(stub);
			expect(pending).toEqual([
				{ tag: "tag1", zone_id: "zone-x" },
				{ tag: "tag1", zone_id: "zone-y" },
			]);
		});

		it("should remove pairs for a zone that returns purge-failed on retry", async () => {
			const stub = getDOStub();

			await runInDurableObject(stub, (_instance, state) => {
				state.storage.sql.exec(
					"INSERT INTO pending_purges (tag, zone_id) VALUES ('tag1', 'zone-x'), ('tag1', 'zone-y')"
				);
				state.storage.setAlarm(Date.now() + 1000);
			});

			vi.mocked(purgeZone)
				.mockResolvedValueOnce({ zoneId: "zone-x", status: "purge-failed" })
				.mockResolvedValueOnce({ zoneId: "zone-y", status: "purge-success" });

			await runDurableObjectAlarm(stub);

			// Both zones' pairs are removed - only rate-limited zones are retried.
			expect(await getPendingPurges(stub)).toEqual([]);
		});

		it("should not discard a re-queued tag when the retry completes", async () => {
			const stub = getDOStub();

			// Simulate: previous alarm moved tag1 from cache_purge into pending_purges.
			// Before the retry fires, tag1 is re-queued by a newer invalidation.
			await runInDurableObject(stub, (_instance, state) => {
				state.storage.sql.exec("INSERT INTO pending_purges (tag, zone_id) VALUES ('tag1', 'test-zone-b')");
				// This is a fresh insert - the original was deleted when the rate-limit was recorded.
				state.storage.sql.exec("INSERT INTO cache_purge (tag) VALUES ('tag1')");
				state.storage.setAlarm(Date.now() + 1000);
			});

			await runDurableObjectAlarm(stub);

			// purgeZone retried tag1 against test-zone-b (the old invalidation).
			expect(purgeZone).toHaveBeenCalledTimes(1);
			expect(purgeZone).toHaveBeenCalledWith(env, "test-zone-b", ["tag1"]);

			// internalPurgeCacheByTags processed tag1 again against all zones (the new invalidation).
			expect(internalPurgeCacheByTags).toHaveBeenCalledWith(env, ["tag1"], ["test-zone-a", "test-zone-b"]);

			// Both tables are empty - the new invalidation was not lost.
			expect(await getTags(stub)).toEqual([]);
			expect(await getPendingPurges(stub)).toEqual([]);
		});
	});
});
