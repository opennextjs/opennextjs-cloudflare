import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getPlatformProxy } from "wrangler";

import { getCloudflareContext } from "./cloudflare-context.js";

const contextSymbol = Symbol.for("__cloudflare-context__");
const context = { env: { TEST_BINDING: "local" }, cf: undefined, ctx: {} };

vi.mock("wrangler", () => ({
	getPlatformProxy: vi.fn(async () => context),
}));

beforeEach(() => {
	vi.stubEnv("NEXT_RUNTIME", undefined);
	vi.stubGlobal("__NEXT_DATA__", undefined);
});

afterEach(() => {
	Reflect.deleteProperty(globalThis, contextSymbol);
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

test("guides synchronous calls into the Worker request", () => {
	Object.defineProperty(globalThis, contextSymbol, { configurable: true, get: () => undefined });

	expect(() => getCloudflareContext()).toThrow(
		"must be called while handling a request on a Cloudflare Worker"
	);
});

test.each([undefined, "nodejs"])(
	"guides asynchronous calls into the Worker request with NEXT_RUNTIME %j",
	async (runtime) => {
		vi.stubEnv("NEXT_RUNTIME", runtime);
		Object.defineProperty(globalThis, contextSymbol, { configurable: true, get: () => undefined });

		await expect(getCloudflareContext({ async: true })).rejects.toThrow(
			"must be called while handling a request on a Cloudflare Worker"
		);
		expect(getPlatformProxy).not.toHaveBeenCalled();
	}
);

test.each([
	{ environment: "a Worker request", descriptor: { get: () => context } },
	{ environment: "initialized Next.js development", descriptor: { value: context } },
])("returns the active context in $environment", async ({ descriptor }) => {
	Object.defineProperty(globalThis, contextSymbol, { configurable: true, ...descriptor });

	expect(getCloudflareContext()).toBe(context);
	await expect(getCloudflareContext({ async: true })).resolves.toBe(context);
	expect(getPlatformProxy).not.toHaveBeenCalled();
});

test("keeps the initialization guidance for Next.js development", async () => {
	expect(() => getCloudflareContext()).toThrow("initOpenNextCloudflareForDev");
	await expect(getCloudflareContext({ async: true })).rejects.toThrow("initOpenNextCloudflareForDev");
});

test("keeps the synchronous static generation guidance", () => {
	vi.stubGlobal("__NEXT_DATA__", { nextExport: true });

	expect(() => getCloudflareContext()).toThrow("call `getCloudflareContext({async: true})`");
});

test.each([
	{ environment: "the Node.js runtime", runtime: "nodejs", nextExport: false },
	{ environment: "static generation", runtime: undefined, nextExport: true },
])("uses the Wrangler proxy in $environment", async ({ runtime, nextExport }) => {
	vi.stubEnv("NEXT_RUNTIME", runtime);
	vi.stubGlobal("__NEXT_DATA__", { nextExport });

	await expect(getCloudflareContext({ async: true })).resolves.toEqual(context);
	expect(getPlatformProxy).toHaveBeenCalledOnce();
	expect(getCloudflareContext()).toEqual(context);
});
