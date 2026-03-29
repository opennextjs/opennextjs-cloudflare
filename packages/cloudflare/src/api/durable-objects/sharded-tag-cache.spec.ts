import { describe, expect, it, vi } from "vitest";

import { DOShardedTagCache } from "./sharded-tag-cache.js";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		ctx: DurableObjectState;
		env: CloudflareEnv;
		constructor(ctx: DurableObjectState, env: CloudflareEnv) {
			this.ctx = ctx;
			this.env = env;
		}
	},
}));

const createDOShardedTagCache = () => {
	const mockState = {
		waitUntil: vi.fn(),
		blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn()),
		storage: {
			setAlarm: vi.fn(),
			getAlarm: vi.fn(),
			sql: {
				exec: vi.fn().mockImplementation(() => ({
					one: vi.fn(),
				})),
			},
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new DOShardedTagCache(mockState as any, {});
};

describe("DOShardedTagCache class", () => {
	it("should block concurrency while creating the table", async () => {
		const cache = createDOShardedTagCache();
		// @ts-expect-error - testing private method
		expect(cache.ctx.blockConcurrencyWhile).toHaveBeenCalled();
		expect(cache.sql.exec).toHaveBeenCalledWith(
			`CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY, revalidatedAt INTEGER)`
		);
		expect(cache.sql.exec).toHaveBeenCalledWith(`ALTER TABLE revalidations ADD COLUMN stale INTEGER`);
		expect(cache.sql.exec).toHaveBeenCalledWith(`ALTER TABLE revalidations ADD COLUMN expiry INTEGER`);
	});

	describe("getTagData", () => {
		it("should return an empty object for empty tags", async () => {
			const cache = createDOShardedTagCache();
			const result = await cache.getTagData([]);
			expect(result).toEqual({});
			expect(cache.sql.exec).not.toHaveBeenCalledWith(expect.stringContaining("SELECT"), expect.anything());
		});

		it("should query all columns and return a record", async () => {
			const cache = createDOShardedTagCache();
			vi.mocked(cache.sql.exec).mockReturnValueOnce({
				toArray: () => [
					{ tag: "tag1", revalidatedAt: 1000, stale: 1000, expiry: null },
					{ tag: "tag2", revalidatedAt: 2000, stale: 1500, expiry: 9999 },
				],
			} as ReturnType<SqlStorage["exec"]>);
			const result = await cache.getTagData(["tag1", "tag2"]);
			expect(result).toEqual({
				tag1: { revalidatedAt: 1000, stale: 1000, expiry: null },
				tag2: { revalidatedAt: 2000, stale: 1500, expiry: 9999 },
			});
		});

		it("should return empty object on SQL error", async () => {
			const cache = createDOShardedTagCache();
			vi.mocked(cache.sql.exec).mockImplementationOnce(() => {
				throw new Error("sql error");
			});
			const result = await cache.getTagData(["tag1"]);
			expect(result).toEqual({});
		});
	});

	describe("writeTags", () => {
		it("should write string tags using the old format (backward compat)", async () => {
			const cache = createDOShardedTagCache();
			await cache.writeTags(["tag1", "tag2"], 1000);
			expect(cache.sql.exec).toHaveBeenCalledWith(
				`INSERT OR REPLACE INTO revalidations (tag, revalidatedAt, stale, expiry) VALUES (?, ?, ?, ?)`,
				"tag1",
				1000,
				1000,
				null
			);
			expect(cache.sql.exec).toHaveBeenCalledWith(
				`INSERT OR REPLACE INTO revalidations (tag, revalidatedAt, stale, expiry) VALUES (?, ?, ?, ?)`,
				"tag2",
				1000,
				1000,
				null
			);
		});

		it("should write object tags using stale and expiry", async () => {
			const cache = createDOShardedTagCache();
			await cache.writeTags([{ tag: "tag1", stale: 5000, expiry: 9999 }]);
			expect(cache.sql.exec).toHaveBeenCalledWith(
				`INSERT OR REPLACE INTO revalidations (tag, revalidatedAt, stale, expiry) VALUES (?, ?, ?, ?)`,
				"tag1",
				5000,
				5000,
				9999
			);
		});

		it("should return early for empty tags", async () => {
			const cache = createDOShardedTagCache();
			const execCallsBeforeCreate = vi.mocked(cache.sql.exec).mock.calls.length;
			await cache.writeTags([]);
			expect(vi.mocked(cache.sql.exec).mock.calls.length).toBe(execCallsBeforeCreate);
		});
	});
});
