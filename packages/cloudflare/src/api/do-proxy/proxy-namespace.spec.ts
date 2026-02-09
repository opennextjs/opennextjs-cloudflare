import { describe, expect, test, vi } from "vitest";

import {
	createProxyDurableObjectNamespace,
	injectDOProxyBindings,
	ProxyDurableObjectId,
} from "./proxy-namespace.js";

function createMockService(
	responseFactory: (url: string, init: RequestInit) => Response = () =>
		new Response(JSON.stringify(42), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
): Service {
	return {
		fetch: vi.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.url;
			return Promise.resolve(responseFactory(url, init ?? {}));
		}),
	} as unknown as Service;
}

describe("ProxyDurableObjectId", () => {
	test("stores the name", () => {
		const id = new ProxyDurableObjectId("my-shard");
		expect(id.name).toBe("my-shard");
	});

	test("toString returns proxy prefix", () => {
		const id = new ProxyDurableObjectId("my-shard");
		expect(id.toString()).toBe("proxy:my-shard");
	});

	test("equals returns true for same name", () => {
		const a = new ProxyDurableObjectId("shard");
		const b = new ProxyDurableObjectId("shard");
		expect(a.equals(b)).toBe(true);
	});

	test("equals returns false for different name", () => {
		const a = new ProxyDurableObjectId("shard-a");
		const b = new ProxyDurableObjectId("shard-b");
		expect(a.equals(b)).toBe(false);
	});
});

describe("createProxyDurableObjectNamespace", () => {
	test("idFromName returns a ProxyDurableObjectId", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "TEST_NS");

		const id = ns.idFromName("my-shard");

		expect(id).toBeInstanceOf(ProxyDurableObjectId);
		expect((id as ProxyDurableObjectId).name).toBe("my-shard");
	});

	test("get with valid ProxyDurableObjectId returns a stub", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "TEST_NS");
		const id = ns.idFromName("my-shard");

		const stub = ns.get(id);

		expect(stub).toBeDefined();
	});

	test("get with non-proxy DurableObjectId throws", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "TEST_NS");
		const fakeId = { toString: () => "fake" } as DurableObjectId;

		expect(() => ns.get(fakeId)).toThrow("non-proxy DurableObjectId");
	});

	test("newUniqueId throws", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "TEST_NS");

		expect(() => ns.newUniqueId()).toThrow("newUniqueId is not supported");
	});

	test("jurisdiction returns self", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "TEST_NS");

		const result = ns.jurisdiction("eu" as DurableObjectJurisdiction);

		expect(result).toBe(ns);
	});
});

describe("proxy stub", () => {
	test("method call serializes as POST with JSON body", async () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "MY_NS");
		const stub = ns.get(ns.idFromName("shard-1"));

		await (stub as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>).someMethod(
			"arg1",
			42
		);

		const fetchMock = service.fetch as ReturnType<typeof vi.fn>;
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/do-rpc/MY_NS/shard-1/someMethod");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual(["arg1", 42]);
	});

	test("returns parsed JSON for 200 response", async () => {
		const service = createMockService(
			() =>
				new Response(JSON.stringify({ key: "value" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
		);
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const stub = ns.get(ns.idFromName("id"));

		const result = await (stub as unknown as Record<string, () => Promise<unknown>>).myMethod();

		expect(result).toEqual({ key: "value" });
	});

	test("returns undefined for 204 response", async () => {
		const service = createMockService(() => new Response(null, { status: 204 }));
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const stub = ns.get(ns.idFromName("id"));

		const result = await (stub as unknown as Record<string, () => Promise<unknown>>).voidMethod();

		expect(result).toBeUndefined();
	});

	test("throws on non-ok response", async () => {
		const service = createMockService(() => new Response("Internal Server Error", { status: 500 }));
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const stub = ns.get(ns.idFromName("id"));

		await expect((stub as unknown as Record<string, () => Promise<unknown>>).badMethod()).rejects.toThrow(
			"DO proxy RPC failed"
		);
	});

	test(".then returns undefined (no spurious RPC)", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const stub = ns.get(ns.idFromName("id"));

		// Accessing .then should not trigger an RPC call
		expect((stub as unknown as Record<string, unknown>).then).toBeUndefined();
		expect(service.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
	});

	test(".toJSON returns undefined (no spurious RPC)", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const stub = ns.get(ns.idFromName("id"));

		expect((stub as unknown as Record<string, unknown>).toJSON).toBeUndefined();
		expect(service.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
	});

	test(".id returns a ProxyDurableObjectId", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const stub = ns.get(ns.idFromName("my-id"));

		expect(stub.id).toBeInstanceOf(ProxyDurableObjectId);
		expect((stub.id as unknown as ProxyDurableObjectId).name).toBe("my-id");
	});

	test(".name returns the DO id name", () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const stub = ns.get(ns.idFromName("my-id"));

		expect(stub.name).toBe("my-id");
	});

	test("passes location hint as header", async () => {
		const service = createMockService();
		const ns = createProxyDurableObjectNamespace(service, "NS");
		const id = ns.idFromName("id");
		const stub = ns.get(id, { locationHint: "enam" } as DurableObjectNamespaceGetDurableObjectOptions);

		await (stub as unknown as Record<string, () => Promise<unknown>>).someMethod();

		const fetchMock = service.fetch as ReturnType<typeof vi.fn>;
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["X-DO-Location-Hint"]).toBe("enam");
	});
});

describe("injectDOProxyBindings", () => {
	test("injects proxy namespaces when OPENNEXT_DO_WORKER is present", () => {
		const env = {
			OPENNEXT_DO_WORKER: createMockService(),
		} as unknown as CloudflareEnv;

		injectDOProxyBindings(env);

		const record = env as unknown as Record<string, unknown>;
		expect(record["NEXT_TAG_CACHE_DO_SHARDED"]).toBeDefined();
		expect(record["NEXT_CACHE_DO_QUEUE"]).toBeDefined();
		expect(record["NEXT_CACHE_DO_PURGE"]).toBeDefined();
	});

	test("does not overwrite existing DO bindings", () => {
		const existingNamespace = { idFromName: vi.fn() };
		const env = {
			OPENNEXT_DO_WORKER: createMockService(),
			NEXT_TAG_CACHE_DO_SHARDED: existingNamespace,
		} as unknown as CloudflareEnv;

		injectDOProxyBindings(env);

		expect((env as unknown as Record<string, unknown>)["NEXT_TAG_CACHE_DO_SHARDED"]).toBe(existingNamespace);
	});

	test("does nothing when OPENNEXT_DO_WORKER is absent", () => {
		const env = {} as unknown as CloudflareEnv;

		injectDOProxyBindings(env);

		const record = env as unknown as Record<string, unknown>;
		expect(record["NEXT_TAG_CACHE_DO_SHARDED"]).toBeUndefined();
		expect(record["NEXT_CACHE_DO_QUEUE"]).toBeUndefined();
		expect(record["NEXT_CACHE_DO_PURGE"]).toBeUndefined();
	});
});
