import type { Queue } from "@opennextjs/aws/types/overrides.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import queueCache from "./queue-cache.js";

const mockedQueue = {
	name: "mocked-queue",
	send: vi.fn(),
} satisfies Queue;

const generateMessage = () => ({
	MessageGroupId: "test",
	MessageBody: {
		eTag: "test",
		url: "test",
		host: "test",
		lastModified: Date.now(),
	},
	MessageDeduplicationId: "test",
});

const mockedPut = vi.fn();
const mockedMatch = vi.fn().mockReturnValue(null);

describe("queue-cache", () => {
	beforeEach(() => {
		// @ts-ignore
		globalThis.caches = {
			open: vi.fn().mockReturnValue({
				put: mockedPut,
				match: mockedMatch,
			}),
		};
	});

	afterEach(() => {
		vi.resetAllMocks();
	});
	test("should send the message to the original queue", async () => {
		const msg = generateMessage();
		const queue = queueCache(mockedQueue, {});
		expect(queue.name).toBe("cached-mocked-queue");
		await queue.send(msg);
		expect(mockedQueue.send).toHaveBeenCalledWith(msg);
	});

	test("should use the local cache", async () => {
		const msg = generateMessage();
		const queue = queueCache(mockedQueue, {});
		await queue.send(msg);

		expect(queue.localCache.size).toBe(1);
		expect(queue.localCache.has(`queue/test/test`)).toBe(true);
		expect(mockedPut).toHaveBeenCalled();

		const spiedHas = vi.spyOn(queue.localCache, "has");
		await queue.send(msg);
		expect(spiedHas).toHaveBeenCalled();

		expect(mockedQueue.send).toHaveBeenCalledTimes(1);

		expect(mockedMatch).toHaveBeenCalledTimes(1);
	});

	test("should clear the local cache after 5s", async () => {
		vi.useFakeTimers();
		const msg = generateMessage();
		const queue = queueCache(mockedQueue, {});
		await queue.send(msg);
		expect(queue.localCache.size).toBe(1);
		expect(queue.localCache.has(`queue/test/test`)).toBe(true);

		vi.advanceTimersByTime(5001);
		const alteredMsg = generateMessage();
		alteredMsg.MessageGroupId = "test2";
		await queue.send(alteredMsg);
		expect(queue.localCache.size).toBe(1);
		console.log(queue.localCache);
		expect(queue.localCache.has(`queue/test2/test`)).toBe(true);
		expect(queue.localCache.has(`queue/test/test`)).toBe(false);
		vi.useRealTimers();
	});

	test("should use the regional cache if not in local cache", async () => {
		const msg = generateMessage();
		const queue = queueCache(mockedQueue, {});
		await queue.send(msg);

		expect(mockedMatch).toHaveBeenCalledTimes(1);
		expect(mockedPut).toHaveBeenCalledTimes(1);
		expect(queue.localCache.size).toBe(1);
		expect(queue.localCache.has(`queue/test/test`)).toBe(true);
		// We need to delete the local cache to test the regional cache
		queue.localCache.delete(`queue/test/test`);

		const spiedHas = vi.spyOn(queue.localCache, "has");
		await queue.send(msg);
		expect(spiedHas).toHaveBeenCalled();
		expect(mockedMatch).toHaveBeenCalledTimes(2);
	});

	test("should return early if the message is in the regional cache", async () => {
		const msg = generateMessage();
		const queue = queueCache(mockedQueue, {});

		mockedMatch.mockReturnValueOnce(new Response(null, { status: 200 }));

		const spiedSend = mockedQueue.send;
		await queue.send(msg);
		expect(spiedSend).not.toHaveBeenCalled();
	});
});
