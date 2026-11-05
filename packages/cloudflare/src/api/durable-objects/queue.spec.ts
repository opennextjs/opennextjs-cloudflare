import type { QueueMessage } from "@opennextjs/aws/types/overrides.js";
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
 * Exposes the protected members of `DOQueueHandler` used by the tests.
 */
class TestDOQueueHandler extends DOQueueHandler {
	public declare ongoingRevalidations: Map<string, Promise<void>>;
	public declare sql: SqlStorage;
	public declare routeInFailedState: Map<
		string,
		{ msg: QueueMessage; retryCount: number; nextAlarmMs: number }
	>;
	public declare service: NonNullable<CloudflareEnv["WORKER_SELF_REFERENCE"]>;
	public declare readonly maxRevalidations: number;
	public declare readonly revalidationRetryInterval: number;
	public declare readonly maxRetries: number;

	public override addToFailedState(msg: QueueMessage) {
		return super.addToFailedState(msg);
	}

	public override addAlarm() {
		return super.addAlarm();
	}

	public override checkSyncTable(msg: QueueMessage) {
		return super.checkSyncTable(msg);
	}
}

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

		if (statement === "DELETE FROM failed_state WHERE id = ?") {
			failedState.delete(bindings[0] as string);
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
 * @param options.sql SQL storage to use, pass the same one to simulate a restart of the Durable Object.
 * @param options.env Additional environment variables.
 * @returns The initialized queue.
 */
const createDurableObjectQueue = async ({
	fetchDuration,
	statusCode,
	headers,
	disableSQLite,
	sql = createSqlStorage(),
	env,
}: {
	fetchDuration: number;
	statusCode?: number;
	headers?: Headers;
	disableSQLite?: boolean;
	sql?: ReturnType<typeof createSqlStorage>;
	env?: Partial<CloudflareEnv>;
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
			sql,
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const queue = new TestDOQueueHandler(mockState as any, {
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
		...env,
	});
	await initialization;
	return queue;
};

const getStorage = (queue: TestDOQueueHandler): DurableObjectStorage => {
	// @ts-expect-error - ctx is a protected field
	return queue.ctx.storage;
};

const mockFetchResponseOnce = (queue: TestDOQueueHandler, response: Response) => {
	vi.mocked(queue.service.fetch).mockResolvedValueOnce(response);
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

	describe("constructor", () => {
		it.each([
			{
				name: "defaults",
				env: {},
				expected: {
					maxRevalidations: 5,
					revalidationTimeout: 10_000,
					revalidationRetryInterval: 2_000,
					maxRetries: 6,
				},
			},
			{
				name: "env overrides",
				env: {
					NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION: "10",
					NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS: "20000",
					NEXT_CACHE_DO_QUEUE_RETRY_INTERVAL_MS: "3000",
					NEXT_CACHE_DO_QUEUE_MAX_RETRIES: "3",
				},
				expected: {
					maxRevalidations: 10,
					revalidationTimeout: 20_000,
					revalidationRetryInterval: 3_000,
					maxRetries: 3,
				},
			},
		])("should configure the queue with the $name", async ({ env, expected }) => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10, env });
			expect(queue).toMatchObject(expected);
		});
	});

	describe("state restoration", () => {
		it("should restore the failed state and the alarm after a restart", async () => {
			const sql = createSqlStorage();
			const queue = await createDurableObjectQueue({ fetchDuration: 10, statusCode: 500, sql });
			await queue.revalidate(createMessage("id"));
			await queue.ongoingRevalidations.get("id");
			const failedState = queue.routeInFailedState.get("id");

			const restartedQueue = await createDurableObjectQueue({ fetchDuration: 10, sql });

			expect(restartedQueue.routeInFailedState.get("id")).toEqual(failedState);
			expect(getStorage(restartedQueue).setAlarm).toHaveBeenCalledWith(failedState?.nextAlarmMs);
		});

		it("should drop the state of other builds after a restart", async () => {
			const sql = createSqlStorage();
			const queue = await createDurableObjectQueue({ fetchDuration: 10, sql });
			mockFetchResponseOnce(queue, new Response(null, { status: 500 }));
			await queue.revalidate(createMessage("failed"));
			await queue.ongoingRevalidations.get("failed");
			await queue.revalidate(createMessage("synced"));
			await queue.ongoingRevalidations.get("synced");

			vi.stubEnv("__OPEN_NEXT_BUILD_ID", "new-build-id");
			const restartedQueue = await createDurableObjectQueue({ fetchDuration: 10, sql });

			expect(restartedQueue.routeInFailedState.size).toBe(0);
			expect(getStorage(restartedQueue).setAlarm).not.toHaveBeenCalled();
			// Without the sync row of the previous build, an older message is not skipped
			await restartedQueue.revalidate(createMessage("old", Date.now() - 1000));
			expect(restartedQueue.service.fetch).toHaveBeenCalledTimes(1);
		});
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
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);
		});

		it("should skip messages older than the last successful revalidation", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.revalidate(createMessage("id"));
			await queue.ongoingRevalidations.get("id");

			await queue.revalidate(createMessage("older", Date.now() - 1000));
			expect(queue.ongoingRevalidations.has("older")).toBe(false);
			expect(queue.service.fetch).toHaveBeenCalledTimes(1);

			await queue.revalidate(createMessage("newer", Date.now() + 1000));
			await queue.ongoingRevalidations.get("newer");
			expect(queue.service.fetch).toHaveBeenCalledTimes(2);
		});

		it("should cancel the response body", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			const cancel = vi.fn();
			mockFetchResponseOnce(
				queue,
				new Response(new ReadableStream({ cancel }), {
					headers: { "x-nextjs-cache": "REVALIDATED" },
				})
			);
			await queue.revalidate(createMessage("id"));
			await queue.ongoingRevalidations.get("id");
			expect(cancel).toHaveBeenCalled();
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

		it.each([500, 403])("should put it in failed state if revalidation fails with %i", async (statusCode) => {
			const queue = await createDurableObjectQueue({
				fetchDuration: 10,
				statusCode,
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
		it("should add a failed state and set the alarm", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.routeInFailedState.get("id")).toMatchObject({
				retryCount: 1,
				nextAlarmMs: Date.now() + 2_000,
			});
			expect(getStorage(queue).setAlarm).toHaveBeenCalledWith(Date.now() + 2_000);
		});

		it("should back off exponentially on retries", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.get("id")).toMatchObject({
				retryCount: 2,
				nextAlarmMs: Date.now() + 4 * queue.revalidationRetryInterval,
			});
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

	describe("failed state cleanup", () => {
		/**
		 * Creates a queue whose first revalidation of `id` fails and is persisted to the failed state.
		 *
		 * @param options Options passed to `createDurableObjectQueue`, used for the subsequent fetches.
		 * @returns The queue with `id` in the failed state.
		 */
		const createQueueWithFailedState = async (options: Parameters<typeof createDurableObjectQueue>[0]) => {
			const queue = await createDurableObjectQueue(options);
			mockFetchResponseOnce(queue, new Response(null, { status: 500 }));
			await queue.revalidate(createMessage("id"));
			await queue.ongoingRevalidations.get("id");
			expect(queue.routeInFailedState.has("id")).toBe(true);
			return queue;
		};

		it.each([
			{ outcome: "succeeds", statusCode: 200, cacheHeader: "REVALIDATED" },
			{ outcome: "returns a 404", statusCode: 404, cacheHeader: "REVALIDATED" },
			{ outcome: "returns a 200 that is not revalidated", statusCode: 200, cacheHeader: "MISS" },
		])(
			"should not restore the route after a restart when the retry $outcome",
			async ({ statusCode, cacheHeader }) => {
				const sql = createSqlStorage();
				const queue = await createQueueWithFailedState({
					fetchDuration: 10,
					statusCode,
					headers: new Headers([["x-nextjs-cache", cacheHeader]]),
					sql,
				});

				await queue.alarm();

				const restartedQueue = await createDurableObjectQueue({ fetchDuration: 10, sql });
				expect(restartedQueue.routeInFailedState.size).toBe(0);
			}
		);

		it("should not restore the route after a restart when the max retries is reached", async () => {
			const sql = createSqlStorage();
			const queue = await createQueueWithFailedState({ fetchDuration: 10, sql });
			queue.routeInFailedState.get("id")!.retryCount = queue.maxRetries;

			await queue.addToFailedState(createMessage("id"));

			const restartedQueue = await createDurableObjectQueue({ fetchDuration: 10, sql });
			expect(restartedQueue.routeInFailedState.size).toBe(0);
		});

		it("should not delete a row for a route that was never in the failed state", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10 });

			await queue.revalidate(createMessage("id"));
			await queue.ongoingRevalidations.get("id");

			expect(queue.sql.exec).not.toHaveBeenCalledWith("DELETE FROM failed_state WHERE id = ?", "id");
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

		it("should not delete from sql when a retry succeeds", async () => {
			const queue = await createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			queue.routeInFailedState.set("id", {
				msg: createMessage("id"),
				retryCount: 1,
				nextAlarmMs: Date.now() - 1000,
			});
			await queue.alarm();
			expect(queue.routeInFailedState.size).toBe(0);
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
