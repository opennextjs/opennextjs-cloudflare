import { describe, expect, it, vi } from "vitest";

import { DOQueueHandler } from "./queue.js";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: CloudflareEnv
		) {}
	},
}));

const createDurableObjectQueue = ({
	fetchDuration,
	statusCode,
	headers,
	disableSQLite,
	sqlExec,
}: {
	fetchDuration: number;
	statusCode?: number;
	headers?: Headers;
	disableSQLite?: boolean;
	sqlExec?: (...args: unknown[]) => unknown;
}) => {
	const mockState = {
		waitUntil: vi.fn(),
		blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn()),
		storage: {
			setAlarm: vi.fn(),
			getAlarm: vi.fn(),
			sql: {
				exec: vi.fn().mockImplementation(
					sqlExec ??
						(() => ({
							one: vi.fn(),
						}))
				),
			},
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new DOQueueHandler(mockState as any, {
		WORKER_SELF_REFERENCE: {
			fetch: vi.fn().mockReturnValue(
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
};

const createMessage = (dedupId: string, lastModified = Date.now()) => ({
	MessageBody: { host: "test.local", url: "/test", eTag: "test", lastModified },
	MessageGroupId: "test.local/test",
	MessageDeduplicationId: dedupId,
	previewModeId: "test",
});

describe("DurableObjectQueue", () => {
	describe("successful revalidation", () => {
		it("should process a single revalidation", async () => {
			process.env.__NEXT_PREVIEW_MODE_ID = "test";
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
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
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			await queue.revalidate(createMessage("id"));
			await queue.revalidate(createMessage("id"));
			expect(queue.ongoingRevalidations.size).toBe(1);
			expect(queue.ongoingRevalidations.has("id")).toBe(true);
		});

		it("should block concurrency", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
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
			const queue = createDurableObjectQueue({
				fetchDuration: 10,
				statusCode: 200,
				headers: new Headers([["x-nextjs-cache", "MISS"]]),
			});
			await queue.revalidate(createMessage("id"));

			await queue.ongoingRevalidations.get("id");

			expect(queue.routeInFailedState.size).toBe(0);
		});

		it("should not put it in failed state for a failed revalidation with 404", async () => {
			const queue = createDurableObjectQueue({
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
			const queue = createDurableObjectQueue({
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
			const queue = createDurableObjectQueue({
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
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addAlarm();
			expect(getStorage(queue).setAlarm).not.toHaveBeenCalled();
		});

		it("should add an alarm if there are failed states", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			const nextAlarmMs = Date.now() + 1000;
			queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 0, nextAlarmMs });
			await queue.addAlarm();
			expect(getStorage(queue).setAlarm).toHaveBeenCalledWith(nextAlarmMs);
		});

		it("should not add an alarm if there is already an alarm set", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 0, nextAlarmMs: 1000 });
			// @ts-expect-error
			queue.ctx.storage.getAlarm.mockResolvedValueOnce(1000);
			await queue.addAlarm();
			expect(getStorage(queue).setAlarm).not.toHaveBeenCalled();
		});

		it("should set the alarm to the lowest nextAlarm", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
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
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.size).toBe(1);
			expect(queue.routeInFailedState.has("id")).toBe(true);
			expect(queue.routeInFailedState.get("id")?.retryCount).toBe(1);
		});

		it("should add a failed state with the correct nextAlarm", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.get("id")?.nextAlarmMs).toBeGreaterThan(Date.now());
			expect(queue.routeInFailedState.get("id")?.retryCount).toBe(1);
		});

		it("should add a failed state with the correct nextAlarm for a retry", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			await queue.addToFailedState(createMessage("id"));
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.get("id")?.nextAlarmMs).toBeGreaterThan(Date.now());
			expect(queue.routeInFailedState.get("id")?.retryCount).toBe(2);
		});

		it("should not add a failed state if it has been retried 6 times", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
			queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 6, nextAlarmMs: 1000 });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.routeInFailedState.size).toBe(0);
		});
	});

	describe("alarm", () => {
		it("should execute revalidations for expired events", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
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
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
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
			const queue = createDurableObjectQueue({ fetchDuration: 10 });
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
			const queue = createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});

		it("should not write to the sqlite storage on failed state", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			await queue.addToFailedState(createMessage("id"));
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});

		it("should not read from the sqlite storage on checkSyncTable", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			queue.checkSyncTable(createMessage("id"));
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});

		it("should not write to sql on successful revalidation", async () => {
			const queue = createDurableObjectQueue({ fetchDuration: 10, disableSQLite: true });
			await queue.revalidate(createMessage("id"));
			expect(queue.sql.exec).not.toHaveBeenCalled();
		});
	});

	describe("sync table", () => {
		// Minimal in-memory stand-in for the `sync` table
		const createSyncSql = () => {
			const rows = new Map<string, number>();
			const exec = (query: string, ...args: unknown[]) => {
				if (query.startsWith("INSERT OR REPLACE INTO sync")) {
					rows.set(args[0] as string, args[1] as number);
				}
				if (query.startsWith("SELECT 1 FROM sync")) {
					const lastSuccess = rows.get(args[0] as string);
					return {
						toArray: () => (lastSuccess !== undefined && lastSuccess > (args[1] as number) ? [1] : []),
					};
				}
				return { toArray: () => [], one: vi.fn() };
			};
			return exec;
		};

		it("should not skip an entry written during a slow revalidation", async () => {
			vi.useFakeTimers();
			try {
				vi.setSystemTime(new Date("2025-01-01T00:00:10.200Z"));
				const queue = createDurableObjectQueue({ fetchDuration: 2_000, sqlExec: createSyncSql() });
				const beforeStart = Date.now() - 5_000;
				await queue.revalidate(createMessage("id", beforeStart));
				const revalidation = queue.ongoingRevalidations.get("id");

				// The incremental cache writes the entry while the revalidation request is running
				await vi.advanceTimersByTimeAsync(500);
				const writtenDuringRevalidation = Date.now();
				await vi.advanceTimersByTimeAsync(1_500);
				await revalidation;

				// A stale hit on the fresh entry must trigger a new revalidation
				expect(queue.checkSyncTable(createMessage("id2", writtenDuringRevalidation))).toBe(false);
				// An entry written before the revalidation started is already covered by it
				expect(queue.checkSyncTable(createMessage("id3", beforeStart))).toBe(true);
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
