import { describe, expect, test, vi } from "vitest";

import { withDOProxy } from "./index.js";

describe("withDOProxy", () => {
	test("wraps handler and injects DO proxy bindings before fetch", async () => {
		const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
		const handler: ExportedHandler<CloudflareEnv> = { fetch: mockFetch };
		const env = { OPENNEXT_DO_WORKER: { fetch: vi.fn() } } as unknown as CloudflareEnv;

		const wrapped = withDOProxy(handler);
		await wrapped.fetch!(new Request("https://example.com"), env, {} as ExecutionContext);

		// Original fetch should have been called
		expect(mockFetch).toHaveBeenCalledTimes(1);

		// DO proxy bindings should have been injected into env
		const record = env as unknown as Record<string, unknown>;
		expect(record["NEXT_TAG_CACHE_DO_SHARDED"]).toBeDefined();
		expect(record["NEXT_CACHE_DO_QUEUE"]).toBeDefined();
		expect(record["NEXT_CACHE_DO_PURGE"]).toBeDefined();
	});

	test("throws if handler has no fetch method", () => {
		const handler = {} as ExportedHandler<CloudflareEnv>;

		expect(() => withDOProxy(handler)).toThrow("handler must define a fetch method");
	});

	test("preserves other handler properties", () => {
		const scheduled = vi.fn();
		const handler: ExportedHandler<CloudflareEnv> = {
			fetch: vi.fn(),
			scheduled,
		};

		const wrapped = withDOProxy(handler);

		expect(wrapped.scheduled).toBe(scheduled);
	});
});
