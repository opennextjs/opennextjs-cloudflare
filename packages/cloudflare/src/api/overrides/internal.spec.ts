import { error } from "@opennextjs/aws/adapters/logger.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internalPurgeCacheByTags, requestPurgeCacheByTags } from "./internal.js";

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
	error: vi.fn(),
}));

describe("cache purge requests", () => {
	const env = { CACHE_PURGE_ZONE_ID: "zone", CACHE_PURGE_API_TOKEN: "token" } as CloudflareEnv;

	beforeEach(() => {
		vi.mocked(error).mockClear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("requestPurgeCacheByTags", () => {
		it("returns success without logging", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, errors: [] })));

			await expect(requestPurgeCacheByTags(env, ["tag"])).resolves.toEqual({ status: "purge-success" });
			expect(error).not.toHaveBeenCalled();
		});

		it("reports missing credentials without logging", async () => {
			await expect(requestPurgeCacheByTags({} as CloudflareEnv, ["tag"])).resolves.toEqual({
				status: "missing-credentials",
				message: expect.any(String),
			});
			expect(error).not.toHaveBeenCalled();
		});

		it("reports rate limiting without logging", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));

			await expect(requestPurgeCacheByTags(env, ["tag"])).resolves.toEqual({
				status: "rate-limit-exceeded",
				message: expect.any(String),
			});
			expect(error).not.toHaveBeenCalled();
		});

		it("describes API errors without logging", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue(Response.json({ success: false, errors: [{ code: 1, message: "boom" }] }))
			);

			await expect(requestPurgeCacheByTags(env, ["tag"])).resolves.toEqual({
				status: "purge-failed",
				message: expect.stringContaining("1: boom"),
			});
			expect(error).not.toHaveBeenCalled();
		});

		it("describes fetch errors without logging", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

			await expect(requestPurgeCacheByTags(env, ["tag"])).resolves.toEqual({
				status: "purge-failed",
				message: expect.stringContaining("network down"),
			});
			expect(error).not.toHaveBeenCalled();
		});
	});

	describe("internalPurgeCacheByTags", () => {
		it("returns the status and logs failures once", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));

			await expect(internalPurgeCacheByTags(env, ["tag"])).resolves.toBe("rate-limit-exceeded");
			expect(error).toHaveBeenCalledOnce();
		});

		it("does not log successful purges", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, errors: [] })));

			await expect(internalPurgeCacheByTags(env, ["tag"])).resolves.toBe("purge-success");
			expect(error).not.toHaveBeenCalled();
		});
	});
});
