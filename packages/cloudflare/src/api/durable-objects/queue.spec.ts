import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DOQueueHandler } from "./queue.js";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: CloudflareEnv
		) {}
	},
}));

/**
 * Wraps rows in a minimal `SqlStorageCursor`.
 *
 * Only the members used by `DOQueueHandler` are implemented: iteration and `toArray()`.
 *
 * @param rows Rows returned by the statement.
 * @returns A cursor over the rows.
 */
const createCursor = <T>(rows: T[]) => ({
	toArray: () => rows,
	[Symbol.iterator]: () => rows[Symbol.iterator](),
});

/**
 * Creates an in-memory fake of the SQL storage used by `DOQueueHandler`.
 *
 * Only the statements issued by the queue are supported. Any other statement throws, so a query change
 * in `queue.ts` fails here instead of being silently ignored.
 *
 * @returns The fake SQL storage, with `exec` as a spy.
 */
const createSqlStorage = () => {
	const failedState = new Map<string, { data: string; buildId: string }>();
	const sync = new Map<string, { lastSuccess: number; buildId: string }>();

	const exec = vi.fn((query: string, ...bindings: unknown[]) => {
		const statement = query.replace(/\s+/g, " ").trim();

		if (statement.startsWith("CREATE TABLE IF NOT EXISTS ")) {
			return createCursor([]);
		}

		if (statement === "DELETE FROM failed_state WHERE buildId != ?") {
			for (const [id, row] of failedState) {
				if (row.buildId !== bindings[0]) failedState.delete(id);
			}
			return createCursor([]);
		}

		if (statement === "DELETE FROM sync WHERE buildId != ?") {
			for (const [id, row] of sync) {
				if (row.buildId !== bindings[0]) sync.delete(id);
			}
			return createCursor([]);
		}

		if (statement === "SELECT * FROM failed_state") {
			return createCursor(Array.from(failedState, ([id, row]) => ({ id, ...row })));
		}

		if (statement === "INSERT OR REPLACE INTO failed_state (id, data, buildId) VALUES (?, ?, ?)") {
			const [id, data, buildId] = bindings as [string, string, string];
			failedState.set(id, { data, buildId });
			return createCursor([]);
		}

		if (statement === "INSERT OR REPLACE INTO sync (id, lastSuccess, buildId) VALUES (?, unixepoch(), ?)") {
			const [id, buildId] = bindings as [string, string];
			sync.set(id, { lastSuccess: Math.floor(Date.now() / 1000), buildId });
			return createCursor([]);
		}

		if (statement === "SELECT 1 FROM sync WHERE id = ? AND lastSuccess > ? LIMIT 1") {
			const [id, lastModified] = bindings as [string, number];
			const row = sync.get(id);
			return createCursor(row && row.lastSuccess > lastModified ? [{ 1: 1 }] : []);
		}

		throw new Error(`Unsupported SQL statement: ${statement}`);
	});

	return { exec };
};

/**
 * Creates a `DOQueueHandler` backed by mocked Durable Object state and service binding.
 *
 * Resolves once the state restored in the constructor (`blockConcurrencyWhile`) is ready.
 *
 * @param options.fetchDuration Delay in ms before the mocked revalidation fetch resolves.
 * @param options.statusCode Status of the mocked revalidation response.
 * @param options.headers Headers of the mocked revalidation response.
 * @param options.disableSQLite Whether to set `NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE`.
 * @returns The initialized queue.
 */
const createDurableObjectQueue = async ({
	fetchDuration,
	statusCode,
	headers,
	disableSQLite,
}: {
	fetchDuration: number;
	statusCode?: number;
	headers?: Headers;
	disableSQLite?: boolean;
}) => {
	let initialization: Promise<unknown> = Promise.resolve();
	const mockState = {
		waitUntil: vi.fn(),
		blockConcurrencyWhile: vi.fn().mockImplementation((fn: () => Promise<unknown>) => {
			initialization = fn();
			return initialization;
		}),
		storage: {
			setAlarm: vi.fn(),
			getAlarm: vi.fn(),
			sql: createSqlStorage(),
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const queue = new DOQueueHandler(mockState as any, {
		WORKER_SELF_REFERENCE: {
			fetch: vi.fn().mockImplementation(
				() =>
					new Promise<Response>((res) =>
						setTimeout(
							() =>
								res(
									new Response(null, {
										status: statusCode,
										headers: headers ?? new Headers([["x-nextjs-cache", "REVALIDATED"]]),
									})
								),
							fetchDuration
						)
					)
			),
			connect: vi.fn(),
		},
		NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE: disableSQLite ? "true" : undefined,
	});
	await initialization;
	return queue;
};

const createMessage = (dedupId: string, lastModified = Date.now()) => ({
	MessageBody: { host: "test.local", url: "/test", eTag: "test", lastModified },
	MessageGroupId: "test.local/test",
	MessageDeduplicationId: dedupId,
	previewModeId: "test",
});

describe("DOQueueHandler", () => {
	beforeEach(() => {
		// Only fake `Date`: the mocked fetch relies on real timers to resolve.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		vi.stubEnv("__NEXT_PREVIEW_MODE_ID", "test");
		vi.stubEnv("__OPEN_NEXT_BUILD_ID", "build-id");
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	describe("successful revalidation", () => {
		it("should process a single revalidation", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			const firstRequest = await queue.revalidate(createMessage("id"));
			expect(firstRequest).toBeUndefined();
			expect(queue.ongoingRevalidations.size).toBe(1);
			expect(queue.ongoingRevalidations.has("id")).toBe(true);

			await queue.ongoingRevalidations.get("id");

			expect(queue.ongoingRevalidations.size).toBe(0);
			expect(queue.ongoingRevalidations.has("id")).toBe(false);
			expect(queue.service.fetch).toHaveBeenCalledWith("https://test.local/test", {
				method: "HEAD",
				headers: {
					"x-prerender-revalidate": "test",
					"x-isr": "1",
				},
				signal: expect.any(AbortSignal),
			});
		});

		it("should dedupe revalidations", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.revalidate(createMessage("id"));
			await queue.revalidate(createMessage("id"));
			expect(queue.ongoingRevalidations.size).toBe(1);
			expect(queue.ongoingRevalidations.has("id")).toBe(true);
		});

		it("should block concurrency", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.revalidate(createMessage("id"));
			await queue.revalidate(createMessage("id2"));
			await queue.revalidate(createMessage("id3"));
			await queue.revalidate(createMessage("id4"));
			await queue.revalidate(createMessage("id5"));
			// the next one should block until one of the previous ones finishes
			const blockedReq = queue.revalidate(createMessage("id6"));

			expect(queue.ongoingRevalidations.size).toBe(queue.maxRevalidations);
			expect(queue.ongoingRevalidations.has("id6")).toBe(false);
			expect(Array.from(queue.ongoingRevalidations.keys())).toEqual(["id", "id2", "id3", "id4", "id5"]);

			// Here we await the blocked request to ensure it's resolved
			await blockedReq;
			// We then need to await for the actual revalidation to finish
			await Promise.all(Array.from(queue.ongoingRevalidations.values()));
			expect(queue.ongoingRevalidations.size).toBe(0);
			expect(queue.service.fetch).toHaveBeenCalledTimes(6);
		});
	});

	describe("failed revalidation", () => {
		it("should not put it in failed state for an incorrect 200", async () => {
			const queue = await createDurableObjectQueue({
				fetchDuration: 10,
				statusCode: 200,
				headers: new Headers([["x-nextjs-cache", "MISS"]]),
			});
			await queue.revalidate(createMessage("id"));

			await queue.ongoingRevalidations.get("id");

			expect(queue.routeInFailedState.size).toBe(0);
		});

		it("should not put it in failed state for a failed revalidation with 404", async () => {
			const queue = await createDurableObjectQueue({
				fetchDuration: 10,
				statusCode: 404,
			});
			await queue.revalidate(createMessage("id"));

			await queue.ongoingRevalidations.get("id");

			expect(queue.routeInFailedState.size).toBe(0);
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);

			await queue.revalidate(createMessage("id"));

			expect(queue.routeInFailedState.size).toBe(0);
			expect(queue.service.fetch).toHaveBeenCalledTimes(2);
		});

		it("should put it in failed state if revalidation fails with 500", async () => {
			const queue = await createDurableObjectQueue({
				fetchDuration: 10,
				statusCode: 500,
			});
			await queue.revalidate(createMessage("id"));

			await queue.ongoingRevalidations.get("id");

			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.routeInFailedState.has("id")).toBe(true);
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);

			await queue.revalidate(createMessage("id"));

			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);
		});

		it("should put it in failed state if revalidation fetch throw", async () => {
			const queue = await createDurableObjectQueue({
				fetchDuration: 10,
			});
			// @ts-expect-error - This is mocked above
			queue.service.fetch.mockImplementationOnce(() => Promise.reject(new Error("fetch error")));
			await queue.revalidate(createMessage("id"));

			await queue.ongoingRevalidations.get("id");

			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.routeInFailedState.has("id")).toBe(true);
			expect(queue.ongoingRevalidations.size).toBe(0);
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);

			await queue.revalidate(createMessage("id"));

			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("addAlarm", () => {
		const getStorage = (queue: DOQueueHandler): DurableObjectStorage => {
			// @ts-expect-error - ctx is a protected field
			return queue.ctx.storage;
		};

		it("should not add an alarm if there are no failed states", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addAlarm();
			expect(getStorage(queue).setAlarm).not.toHaveBeenCalled();
		});

		it("should add an alarm if there are failed states", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			const nextAlarmMs = Date.now() + 1000;
			queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 0, nextAlarmMs });
			await queue.addAlarm();
			expect(getStorage(queue).setAlarm).toHaveBeenCalledWith(nextAlarmMs);
		});

		it("should not add an alarm if there is already an alarm set", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 0, nextAlarmMs: 1000 });
			// @ts-expect-error
			queue.ctx.storage.getAlarm.mockResolvedValueOnce(1000);
			await queue.addAlarm();
			expect(getStorage(queue).setAlarm).not.toHaveBeenCalled();
		});

		it("should set the alarm to the lowest nextAlarm", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			const nextAlarmMs = Date.now() + 1000;
			const firstAlarm = Date.now() + 500;
			queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 0, nextAlarmMs });
			queue.routeInFailedState.set("id2", {
				msg: createMessage("id2"),
				retryCount: 0,
				nextAlarmMs: firstAlarm,
			});
			await queue.addAlarm();
			expect(getStorage(queue).setAlarm).toHaveBeenCalledWith(firstAlarm);
		});
	});

	describe("addToFailedState", () => {
		it("should add a failed state", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.routeInFailedState.has("id")).toBe(true);
			expect(queue.routeInFailedState.get("id")?.retryCount).toBe(1);
		});

		it("should add a failed state with the correct nextAlarm", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.get("id")?.nextAlarmMs).toBeGreaterThan(Date.now());
			expect(queue.routeInFailedState.get("id")?.retryCount).toBe(1);
		});

		it("should add a failed state with the correct nextAlarm for a retry", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.get("id")?.nextAlarmMs).toBeGreaterThan(Date.now());
			expect(queue.routeInFailedState.get("id")?.retryCount).toBe(2);
		});

		it("should not add a failed state once the max number of retries is reached", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			queue.routeInFailedState.set("id", {
				msg: createMessage("id"),
				retryCount: queue.maxRetries,
				nextAlarmMs: 1000,
			});
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.size).toBe(0);
		});
	});

	describe("alarm", () => {
		it("should execute revalidations for expired events", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			queue.routeInFailedState.set("id", {
				msg: createMessage("id"),
				retryCount: 0,
				nextAlarmMs: Date.now() - 1000,
			});
			queue.routeInFailedState.set("id2", {
				msg: createMessage("id2"),
				retryCount: 0,
				nextAlarmMs: Date.now() - 1000,
			});
			await queue.alarm();
			expect(queue.routeInFailedState.size).toBe(0);
			expect(queue.service.fetch).toHaveBeenCalledTimes(2);
		});

		it("should execute revalidations for the next event to retry", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			queue.routeInFailedState.set("id", {
				msg: createMessage("id"),
				retryCount: 0,
				nextAlarmMs: Date.now() + 1000,
			});
			queue.routeInFailedState.set("id2", {
				msg: createMessage("id2"),
				retryCount: 0,
				nextAlarmMs: Date.now() + 500,
			});
			await queue.alarm();
			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);
			expect(queue.routeInFailedState.has("id2")).toBe(false);
		});

		it("should execute revalidations for the next event to retry and expired events", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			queue.routeInFailedState.set("id", {
				msg: createMessage("id"),
				retryCount: 0,
				nextAlarmMs: Date.now() + 1000,
			});
			queue.routeInFailedState.set("id2", {
				msg: createMessage("id2"),
				retryCount: 0,
				nextAlarmMs: Date.now() - 1000,
			});
			await queue.alarm();
			expect(queue.routeInFailedState.size).toBe(0);
			expect(queue.service.fetch).toHaveBeenCalledTimes(2);
		});
	});

	describe("disableSQLite", () => {
		it("should not initialize the sqlite storage", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});

		it("should not write to the sqlite storage on failed state", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});

		it("should not read from the sqlite storage on checkSyncTable", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			queue.checkSyncTable(createMessage("id"));
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});

		it("should not write to sql on successful revalidation", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			await queue.revalidate(createMessage("id"));
			await queue.ongoingRevalidations.get("id");
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});
	});
});
