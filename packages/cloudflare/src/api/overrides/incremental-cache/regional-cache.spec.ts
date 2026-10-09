import type { CacheValue, IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withRegionalCache } from "./regional-cache.js";

const waitUntilPromises: Promise<unknown>[] = [];

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: () => ({
		ctx: {
			waitUntil: (promise: Promise<unknown>) => {
				waitUntilPromises.push(promise);
			},
		},
	}),
}));

const createValue = (body: string): CacheValue<"cache"> =>
	({
		type: "app",
		body,
		revalidate: 1_800,
		meta: {},
	}) as CacheValue<"cache">;

const createCache = () => {
	const entries = new Map<string, Response>();
	const cache = {
		match: vi.fn(async (key: string) => entries.get(key)?.clone()),
		put: vi.fn(async (key: string, response: Response) => {
			entries.set(key, response.clone());
		}),
		delete: vi.fn(async (key: string) => entries.delete(key)),
	};

	return { cache, entries };
};

const readEntry = async (entries: Map<string, Response>) => {
	const response = entries.values().next().value as Response | undefined;
	return response
		? ((await response.clone().json()) as { lastModified: number; value: { body: string } })
		: undefined;
};

const expectStateReleased = (regionalCache: IncrementalCache) => {
	const internals = regionalCache as unknown as {
		cacheStates: Map<string, unknown>;
		pendingCacheOperations: Map<string, unknown>;
	};
	expect(internals.cacheStates.size).toBe(0);
	expect(internals.pendingCacheOperations.size).toBe(0);
};

describe("RegionalCache", () => {
	beforeEach(() => {
		waitUntilPromises.length = 0;
		globalThis.nextVersion = "16.2.6";
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("does not replace a newer entry with an older lazy refresh in the same instance", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		expect(store.get).toHaveBeenCalledOnce();

		await regionalCache.set("route", createValue("new"));
		resolveStoreGet?.({ value: createValue("old"), lastModified: 100 });
		await Promise.all(waitUntilPromises);

		const entry = await readEntry(entries);
		expect(entry?.lastModified).toBe(200);
		expect(entry?.value.body).toBe("new");
		expect(cache.put).toHaveBeenCalledTimes(2);
		expectStateReleased(regionalCache);
	});

	it("does not extend an unchanged entry lifetime", async () => {
		const { cache } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		const store = {
			name: "test-store",
			get: vi.fn().mockResolvedValue({ value: createValue("same"), lastModified: 100 }),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("same"));
		await regionalCache.get("route");
		await Promise.all(waitUntilPromises);

		expect(cache.put).toHaveBeenCalledTimes(1);
		expectStateReleased(regionalCache);
	});

	it("writes a newer backing-store generation", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		const store = {
			name: "test-store",
			get: vi.fn().mockResolvedValue({ value: createValue("new"), lastModified: 200 }),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		await Promise.all(waitUntilPromises);

		const entry = await readEntry(entries);
		expect(entry?.lastModified).toBe(200);
		expect(entry?.value.body).toBe("new");
		expect(cache.put).toHaveBeenCalledTimes(2);
		expectStateReleased(regionalCache);
	});

	it("keeps the later explicit set when timestamps are equal", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		const store = {
			name: "test-store",
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, { mode: "long-lived" });

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("first"));
		await regionalCache.set("route", createValue("second"));

		const entry = await readEntry(entries);
		expect(entry?.lastModified).toBe(100);
		expect(entry?.value.body).toBe("second");
		expect(cache.put).toHaveBeenCalledTimes(2);
		expectStateReleased(regionalCache);
	});

	it("does not restore a lazy refresh after deletion", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		await regionalCache.delete("route");

		resolveStoreGet?.({ value: createValue("newer-store"), lastModified: 200 });
		await Promise.all(waitUntilPromises);

		expect(await readEntry(entries)).toBeUndefined();
		expect(cache.put).toHaveBeenCalledTimes(1);
		expect(cache.delete).toHaveBeenCalledOnce();
		expectStateReleased(regionalCache);
	});

	it("does not populate a cache miss after a concurrent set", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, { mode: "long-lived" });

		vi.spyOn(Date, "now").mockReturnValue(200);
		const cacheMiss = regionalCache.get("route");
		await vi.waitFor(() => expect(store.get).toHaveBeenCalledOnce());
		await regionalCache.set("route", createValue("new"));
		resolveStoreGet?.({ value: createValue("old"), lastModified: 100 });
		await cacheMiss;
		await Promise.all(waitUntilPromises);

		const entry = await readEntry(entries);
		expect(entry?.lastModified).toBe(200);
		expect(entry?.value.body).toBe("new");
		expect(cache.put).toHaveBeenCalledTimes(1);
		expectStateReleased(regionalCache);
	});

	it("does not restore a lazy refresh after a failed regional set", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		cache.put.mockRejectedValueOnce(new Error("cache unavailable"));
		await regionalCache.set("route", createValue("new"));
		resolveStoreGet?.({ value: createValue("store"), lastModified: 150 });
		await Promise.all(waitUntilPromises);

		expect((await readEntry(entries))?.lastModified).toBe(100);
		expect(cache.put).toHaveBeenCalledTimes(2);
		expectStateReleased(regionalCache);
	});

	it("does not restore a lazy refresh after a failed regional delete", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		cache.delete.mockRejectedValueOnce(new Error("cache unavailable"));
		await regionalCache.delete("route");
		resolveStoreGet?.({ value: createValue("store"), lastModified: 200 });
		await Promise.all(waitUntilPromises);

		expect((await readEntry(entries))?.lastModified).toBe(100);
		expect(cache.put).toHaveBeenCalledTimes(1);
		expectStateReleased(regionalCache);
	});

	it("deletes malformed cache entries", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		const store = {
			name: "test-store",
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, { mode: "long-lived" });

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		const cacheKey = entries.keys().next().value as string;
		entries.set(cacheKey, new Response("invalid-json"));
		cache.delete.mockClear();

		await expect(regionalCache.get("route")).resolves.toBeNull();
		expect(cache.delete).toHaveBeenCalledOnce();
		expectStateReleased(regionalCache);
	});

	it("releases per-key state after operations settle", async () => {
		const { cache } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		const store = {
			name: "test-store",
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, { mode: "long-lived" });

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("value"));

		expectStateReleased(regionalCache);
	});

	it("releases per-key state when malformed cache deletion fails", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		const store = {
			name: "test-store",
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, { mode: "long-lived" });

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		const cacheKey = entries.keys().next().value as string;
		entries.set(cacheKey, new Response("invalid-json"));
		cache.delete.mockRejectedValueOnce(new Error("cache unavailable"));

		await expect(regionalCache.get("route")).resolves.toBeNull();
		expect(cache.delete).toHaveBeenCalledOnce();
		expectStateReleased(regionalCache);
	});

	it("handles cache-miss population failures without leaking state", async () => {
		const { cache } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
		cache.put.mockRejectedValueOnce(new Error("cache unavailable"));

		const store = {
			name: "test-store",
			get: vi.fn().mockResolvedValue({ value: createValue("value"), lastModified: 100 }),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, { mode: "long-lived" });

		await expect(regionalCache.get("route")).resolves.toEqual({
			value: createValue("value"),
			lastModified: 100,
		});
		await Promise.all(waitUntilPromises);

		expectStateReleased(regionalCache);
	});

	it("keeps set invalidation active while the backing-store write is delayed", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let resolveStoreSet: (() => void) | undefined;
		const storeSet = new Promise<void>((resolve) => {
			resolveStoreSet = resolve;
		});
		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi
				.fn()
				.mockResolvedValueOnce(undefined)
				.mockImplementationOnce(() => storeSet),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		const pendingSet = regionalCache.set("route", createValue("new"));
		resolveStoreGet?.({ value: createValue("store"), lastModified: 150 });
		await Promise.all(waitUntilPromises);
		resolveStoreSet?.();
		await pendingSet;

		expect((await readEntry(entries))?.lastModified).toBe(200);
		expectStateReleased(regionalCache);
	});

	it("keeps delete invalidation active while the backing-store delete is delayed", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let resolveStoreDelete: (() => void) | undefined;
		const storeDelete = new Promise<void>((resolve) => {
			resolveStoreDelete = resolve;
		});
		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi.fn(),
			delete: vi.fn(() => storeDelete),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		const pendingDelete = regionalCache.delete("route");
		resolveStoreGet?.({ value: createValue("store"), lastModified: 200 });
		await Promise.all(waitUntilPromises);
		resolveStoreDelete?.();
		await pendingDelete;

		expect(await readEntry(entries)).toBeUndefined();
		expectStateReleased(regionalCache);
	});

	it("does not refresh an old cache response observed before a concurrent set", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let releaseMatch: (() => void) | undefined;
		const matchGate = new Promise<void>((resolve) => {
			releaseMatch = resolve;
		});
		let markMatchCaptured: (() => void) | undefined;
		const matchCaptured = new Promise<void>((resolve) => {
			markMatchCaptured = resolve;
		});
		cache.match.mockImplementationOnce(async (key: string) => {
			const response = entries.get(key)?.clone();
			markMatchCaptured?.();
			await matchGate;
			return response;
		});

		const store = {
			name: "test-store",
			get: vi.fn().mockResolvedValue({ value: createValue("store"), lastModified: 150 }),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);
		await regionalCache.set("route", createValue("old"));
		const pendingGet = regionalCache.get("route");
		await matchCaptured;
		await regionalCache.set("route", createValue("new"));
		releaseMatch?.();
		await pendingGet;
		await Promise.all(waitUntilPromises);

		const entry = await readEntry(entries);
		expect(entry?.lastModified).toBe(200);
		expect(entry?.value.body).toBe("new");
		expectStateReleased(regionalCache);
	});

	it("does not delete a concurrent set after observing an old malformed response", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		const store = {
			name: "test-store",
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, { mode: "long-lived" });

		vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);
		await regionalCache.set("route", createValue("old"));
		const cacheKey = entries.keys().next().value as string;
		entries.set(cacheKey, new Response("invalid-json"));

		let releaseMatch: (() => void) | undefined;
		const matchGate = new Promise<void>((resolve) => {
			releaseMatch = resolve;
		});
		let markMatchCaptured: (() => void) | undefined;
		const matchCaptured = new Promise<void>((resolve) => {
			markMatchCaptured = resolve;
		});
		cache.match.mockImplementationOnce(async (key: string) => {
			const response = entries.get(key)?.clone();
			markMatchCaptured?.();
			await matchGate;
			return response;
		});

		const pendingGet = regionalCache.get("route");
		await matchCaptured;
		await regionalCache.set("route", createValue("new"));
		releaseMatch?.();
		await pendingGet;

		const entry = await readEntry(entries);
		expect(entry?.lastModified).toBe(200);
		expect(entry?.value.body).toBe("new");
		expectStateReleased(regionalCache);
	});

	it("does not restore a lazy refresh after a backing-store set failure", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let rejectStoreSet: ((error: Error) => void) | undefined;
		const storeSet = new Promise<void>((_resolve, reject) => {
			rejectStoreSet = reject;
		});
		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi
				.fn()
				.mockResolvedValueOnce(undefined)
				.mockImplementationOnce(() => storeSet),
			delete: vi.fn(),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		const failedSet = regionalCache.set("route", createValue("new"));
		resolveStoreGet?.({ value: createValue("store"), lastModified: 200 });
		await Promise.all(waitUntilPromises);
		rejectStoreSet?.(new Error("store unavailable"));
		await failedSet;

		expect((await readEntry(entries))?.lastModified).toBe(100);
		expect(cache.put).toHaveBeenCalledTimes(1);
		expectStateReleased(regionalCache);
	});

	it("does not restore a lazy refresh after a backing-store delete failure", async () => {
		const { cache, entries } = createCache();
		vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

		let rejectStoreDelete: ((error: Error) => void) | undefined;
		const storeDelete = new Promise<void>((_resolve, reject) => {
			rejectStoreDelete = reject;
		});
		let resolveStoreGet: ((entry: Awaited<ReturnType<IncrementalCache["get"]>>) => void) | undefined;
		const storeGet = new Promise<Awaited<ReturnType<IncrementalCache["get"]>>>((resolve) => {
			resolveStoreGet = resolve;
		});
		const store = {
			name: "test-store",
			get: vi.fn(() => storeGet),
			set: vi.fn(),
			delete: vi.fn(() => storeDelete),
		} satisfies IncrementalCache;
		const regionalCache = withRegionalCache(store, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: true,
		});

		vi.spyOn(Date, "now").mockReturnValue(100);
		await regionalCache.set("route", createValue("old"));
		await regionalCache.get("route");
		const failedDelete = regionalCache.delete("route");
		resolveStoreGet?.({ value: createValue("store"), lastModified: 200 });
		await Promise.all(waitUntilPromises);
		rejectStoreDelete?.(new Error("store unavailable"));
		await failedDelete;

		expect((await readEntry(entries))?.lastModified).toBe(100);
		expect(cache.put).toHaveBeenCalledTimes(1);
		expectStateReleased(regionalCache);
	});
});
