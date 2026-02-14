import { describe, expect, test, vi } from "vitest";

import { createDOProxyHandler } from "./proxy-handler.js";

function createMockEnv(overrides: Record<string, unknown> = {}): CloudflareEnv {
	const mockStub = {
		getLastRevalidated: vi.fn().mockResolvedValue(123),
		writeTags: vi.fn().mockResolvedValue(undefined),
		failingMethod: vi.fn().mockRejectedValue(new Error("DO error")),
	};

	const mockNamespace = {
		idFromName: vi.fn().mockReturnValue({ toString: () => "mock-id" }),
		get: vi.fn().mockReturnValue(mockStub),
	};

	return {
		NEXT_TAG_CACHE_DO_SHARDED: mockNamespace,
		NEXT_CACHE_DO_QUEUE: mockNamespace,
		NEXT_CACHE_DO_PURGE: mockNamespace,
		...overrides,
	} as unknown as CloudflareEnv;
}

function createRequest(
	path: string,
	options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Request {
	return new Request(`https://do-proxy${path}`, {
		method: options.method ?? "POST",
		headers: { "Content-Type": "application/json", ...options.headers },
		body: options.body !== undefined ? JSON.stringify(options.body) : JSON.stringify([]),
	});
}

describe("createDOProxyHandler", () => {
	const handler = createDOProxyHandler();

	test("routes valid RPC call and returns JSON result", async () => {
		const env = createMockEnv();
		const request = createRequest("/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/my-shard/getLastRevalidated", {
			body: [["tag1", "tag2"]],
		});

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(await response.json()).toBe(123);
	});

	test("returns 204 for void methods", async () => {
		const env = createMockEnv();
		const request = createRequest("/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/my-shard/writeTags", {
			body: [["tag1"], 1000],
		});

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(204);
	});

	test("returns 404 for non-RPC paths", async () => {
		const env = createMockEnv();
		const request = createRequest("/some-other-path");

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(404);
	});

	test("returns 405 for non-POST requests", async () => {
		const env = createMockEnv();
		const request = new Request("https://do-proxy/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/id/method", {
			method: "GET",
		});

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(405);
	});

	test("returns 400 for malformed paths", async () => {
		const env = createMockEnv();
		const request = createRequest("/do-rpc/only-two-parts");

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(400);
	});

	test("returns 404 for unknown namespace", async () => {
		const env = createMockEnv();
		const request = createRequest("/do-rpc/UNKNOWN_NAMESPACE/id/method");

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(404);
		expect(await response.text()).toContain("Unknown DO namespace");
	});

	test("returns 500 when namespace binding is missing from env", async () => {
		const env = createMockEnv({ NEXT_TAG_CACHE_DO_SHARDED: undefined });
		const request = createRequest("/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/id/method");

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(500);
		expect(await response.text()).toContain("not bound");
	});

	test("returns 404 when method does not exist on stub", async () => {
		const env = createMockEnv();
		const request = createRequest("/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/id/nonExistentMethod");

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(404);
		expect(await response.text()).toContain("not found");
	});

	test("returns 500 when method throws", async () => {
		const env = createMockEnv();
		const request = createRequest("/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/id/failingMethod");

		const response = await handler.fetch!(request, env, {} as ExecutionContext);

		expect(response.status).toBe(500);
		expect(await response.text()).toContain("DO error");
	});

	test("passes location hint header to namespace.get", async () => {
		const env = createMockEnv();
		const request = createRequest("/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/my-shard/getLastRevalidated", {
			body: [["tag1"]],
			headers: { "X-DO-Location-Hint": "enam" },
		});

		await handler.fetch!(request, env, {} as ExecutionContext);

		const ns = (env as Record<string, unknown>)["NEXT_TAG_CACHE_DO_SHARDED"] as {
			get: ReturnType<typeof vi.fn>;
		};
		expect(ns.get).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationHint: "enam" }));
	});

	test("decodes URI-encoded path components", async () => {
		const env = createMockEnv();
		const encodedName = encodeURIComponent("shard/with/slashes");
		const request = createRequest(`/do-rpc/NEXT_TAG_CACHE_DO_SHARDED/${encodedName}/getLastRevalidated`, {
			body: [["tag1"]],
		});

		await handler.fetch!(request, env, {} as ExecutionContext);

		const ns = (env as Record<string, unknown>)["NEXT_TAG_CACHE_DO_SHARDED"] as {
			idFromName: ReturnType<typeof vi.fn>;
		};
		expect(ns.idFromName).toHaveBeenCalledWith("shard/with/slashes");
	});
});
