import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";

function tagCache(name: string) {
	return env.TAG_CACHE.get(env.TAG_CACHE.idFromName(name));
}

describe("DOShardedTagCache on Workers", () => {
	test("initializes SQLite before serving writes and reads both tag formats", async () => {
		const stub = tagCache("both-tag-formats");
		await Promise.all([
			stub.writeTags(["older", "another"], 1000),
			stub.writeTags([{ tag: "expiring", stale: 2000, expire: 9999 }]),
		]);
		await stub.writeTags([{ tag: "defaults" }], 3000);

		await expect(stub.getTagData(["older", "another", "expiring", "defaults", "missing"])).resolves.toEqual({
			older: { revalidatedAt: 1000, stale: 1000, expire: null },
			another: { revalidatedAt: 1000, stale: 1000, expire: null },
			expiring: { revalidatedAt: 2000, stale: 2000, expire: 9999 },
			defaults: { revalidatedAt: 3000, stale: 3000, expire: null },
		});
	});

	test("retains existing rows when an instance opens a pre-1.19 database", async () => {
		const stub = tagCache("legacy-schema");
		await runInDurableObject(stub, (_instance, { storage }) => {
			storage.sql.exec("DROP TABLE revalidations");
			storage.sql.exec("CREATE TABLE revalidations (tag TEXT PRIMARY KEY, revalidatedAt INTEGER)");
			storage.sql.exec("INSERT INTO revalidations (tag, revalidatedAt) VALUES (?, ?)", "existing", 1000);
		});
		await evictDurableObject(stub);

		const reopened = tagCache("legacy-schema");
		await expect(reopened.getTagData(["existing"])).resolves.toEqual({
			existing: { revalidatedAt: 1000, stale: null, expire: null },
		});
		await reopened.writeTags([{ tag: "new", stale: 2000, expire: 5000 }]);
		await expect(reopened.getTagData(["new"])).resolves.toEqual({
			new: { revalidatedAt: 2000, stale: 2000, expire: 5000 },
		});
	});

	test("handles empty reads and writes", async () => {
		const stub = tagCache("empty-input");
		await stub.writeTags(["existing"], 1000);
		await stub.writeTags([], 2000);

		await expect(stub.getTagData([])).resolves.toEqual({});
		await expect(stub.getTagData(["existing"])).resolves.toEqual({
			existing: { revalidatedAt: 1000, stale: 1000, expire: null },
		});
	});

	test("returns an empty result when SQLite cannot read the table", async () => {
		const stub = tagCache("missing-table");
		await runInDurableObject(stub, (_instance, { storage }) => {
			storage.sql.exec("DROP TABLE revalidations");
		});

		await expect(stub.getTagData(["existing"])).resolves.toEqual({});
	});
});
