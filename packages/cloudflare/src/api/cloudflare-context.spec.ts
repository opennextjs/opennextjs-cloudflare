import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext, initOpenNextCloudflareForDev } from "./cloudflare-context.js";

const getPlatformProxy = vi.hoisted(() => vi.fn());

vi.mock("wrangler", () => ({ getPlatformProxy }));

const contextSymbol = Symbol.for("__cloudflare-context__");

describe("wrangler config forwarding", () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const g = globalThis as any;
	let originalRunInContext: unknown;

	beforeEach(async () => {
		getPlatformProxy.mockReset().mockResolvedValue({ env: {}, cf: {}, ctx: {} });
		vi.stubEnv("NEXT_DEV_WRANGLER_CONFIG_PATH", "");
		vi.stubEnv("NEXT_DEV_WRANGLER_ENV", "");
		vi.stubEnv("NEXT_RUNTIME", "nodejs");
		delete g[contextSymbol];
		originalRunInContext = (await import("node:vm")).runInContext;
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		delete g[contextSymbol];
		delete g.AsyncLocalStorage;
		(await import("node:vm")).default.runInContext = originalRunInContext as never;
	});

	it("initOpenNextCloudflareForDev persists an absolute configPath and the environment", async () => {
		g.AsyncLocalStorage = class {};
		await initOpenNextCloudflareForDev({ configPath: "custom.jsonc", environment: "staging" });

		expect(process.env.NEXT_DEV_WRANGLER_CONFIG_PATH).toBe(resolve("custom.jsonc"));
		expect(process.env.NEXT_DEV_WRANGLER_ENV).toBe("staging");
	});

	it("falls back to the env vars when the global context is absent", async () => {
		vi.stubEnv("NEXT_DEV_WRANGLER_CONFIG_PATH", "/abs/custom.jsonc");
		vi.stubEnv("NEXT_DEV_WRANGLER_ENV", "staging");

		await getCloudflareContext({ async: true });

		expect(getPlatformProxy).toHaveBeenCalledWith(
			expect.objectContaining({ configPath: "/abs/custom.jsonc", environment: "staging" })
		);
	});

	it("explicit options win over the env vars", async () => {
		vi.stubEnv("NEXT_DEV_WRANGLER_CONFIG_PATH", "/abs/from-env.jsonc");
		vi.stubEnv("NEXT_DEV_WRANGLER_ENV", "from-env");
		g.AsyncLocalStorage = class {};

		await initOpenNextCloudflareForDev({ configPath: "explicit.jsonc", environment: "explicit" });

		expect(getPlatformProxy).toHaveBeenCalledWith(
			expect.objectContaining({ configPath: "explicit.jsonc", environment: "explicit" })
		);
		expect(process.env.NEXT_DEV_WRANGLER_CONFIG_PATH).toBe(resolve("explicit.jsonc"));
	});
});
