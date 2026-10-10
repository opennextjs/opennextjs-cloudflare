import logger from "@opennextjs/aws/logger.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWrangler } from "../commands/utils/run-wrangler.js";
import { ensureR2Bucket } from "./ensure-r2-bucket.js";
import { isNonInteractiveOrCI } from "./is-interactive.js";

const { MockCloudflare, mockR2BucketsGet } = vi.hoisted(() => {
	const mockR2BucketsGet = vi.fn();

	class MockCloudflare {
		static NotFoundError = class extends Error {};

		accounts = { list: vi.fn(() => []) };

		r2 = {
			buckets: {
				get: mockR2BucketsGet,
				create: vi.fn(),
			},
		};
	}

	return { MockCloudflare: vi.fn(MockCloudflare), mockR2BucketsGet };
});

vi.mock("@opennextjs/aws/build/helper.js", () => ({
	findPackagerAndRoot: vi.fn(() => ({ packager: "pnpm", root: "/tmp" })),
}));

vi.mock("../commands/utils/run-wrangler.js", () => ({
	runWrangler: vi.fn(),
}));

vi.mock("@opennextjs/aws/logger.js", () => ({
	default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("./is-interactive.js", () => ({
	isNonInteractiveOrCI: vi.fn(() => false),
}));

vi.mock("cloudflare", () => ({
	default: MockCloudflare,
}));

vi.mock("./ask-account-selection.js", () => ({
	askAccountSelection: vi.fn(),
}));

describe("ensureR2Bucket", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isNonInteractiveOrCI).mockReturnValue(false);
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account-id");
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		vi.stubEnv("CLOUDFLARE_EMAIL", "");
		mockR2BucketsGet.mockResolvedValue({});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("disables response compression when authenticating with a token", async () => {
		vi.mocked(runWrangler).mockReturnValue({
			success: true,
			stdout: JSON.stringify({ type: "api_token", token: "test-token" }),
			stderr: "",
		});

		await expect(ensureR2Bucket("/tmp/app", "test-bucket")).resolves.toEqual({
			success: true,
			bucketName: "test-bucket",
		});
		expect(MockCloudflare).toHaveBeenCalledWith({
			apiToken: "test-token",
			defaultHeaders: { "Accept-Encoding": "identity" },
		});
	});

	it("disables response compression when authenticating with an API key", async () => {
		vi.mocked(runWrangler).mockReturnValue({
			success: true,
			stdout: JSON.stringify({ type: "api_key", key: "test-key", email: "test@example.com" }),
			stderr: "",
		});

		await expect(ensureR2Bucket("/tmp/app", "test-bucket")).resolves.toEqual({
			success: true,
			bucketName: "test-bucket",
		});
		expect(MockCloudflare).toHaveBeenCalledWith({
			apiKey: "test-key",
			apiEmail: "test@example.com",
			defaultHeaders: { "Accept-Encoding": "identity" },
		});
	});

	it("uses CLOUDFLARE_API_TOKEN without spawning wrangler", async () => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");

		await expect(ensureR2Bucket("/tmp/app", "test-bucket")).resolves.toEqual({
			success: true,
			bucketName: "test-bucket",
		});
		expect(runWrangler).not.toHaveBeenCalled();
		expect(MockCloudflare).toHaveBeenCalledWith({
			apiToken: "env-token",
			defaultHeaders: { "Accept-Encoding": "identity" },
		});
	});

	it("uses CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL without spawning wrangler", async () => {
		vi.stubEnv("CLOUDFLARE_API_KEY", "env-key");
		vi.stubEnv("CLOUDFLARE_EMAIL", "env@example.com");

		await expect(ensureR2Bucket("/tmp/app", "test-bucket")).resolves.toEqual({
			success: true,
			bucketName: "test-bucket",
		});
		expect(runWrangler).not.toHaveBeenCalled();
		expect(MockCloudflare).toHaveBeenCalledWith({
			apiKey: "env-key",
			apiEmail: "env@example.com",
			defaultHeaders: { "Accept-Encoding": "identity" },
		});
	});

	it("falls back to `wrangler login` and logs at debug level when wrangler prints nothing (interactive)", async () => {
		vi.mocked(runWrangler)
			.mockReturnValueOnce({ success: true, stdout: "", stderr: "" })
			.mockReturnValueOnce({ success: true, stdout: "", stderr: "" })
			.mockReturnValueOnce({
				success: true,
				stdout: JSON.stringify({ type: "oauth", token: "login-token" }),
				stderr: "",
			});

		await expect(ensureR2Bucket("/tmp/app", "test-bucket")).resolves.toEqual({
			success: true,
			bucketName: "test-bucket",
		});
		expect(runWrangler).toHaveBeenCalledWith(expect.anything(), ["login"], expect.anything());
		expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("printed nothing"));
	});

	it("does not run `wrangler login` and logs an error in non-interactive environments", async () => {
		vi.mocked(runWrangler).mockReturnValue({ success: true, stdout: "", stderr: "" });
		vi.mocked(isNonInteractiveOrCI).mockReturnValue(true);

		const result = await ensureR2Bucket("/tmp/app", "test-bucket");

		expect(result).toMatchObject({ success: false });
		expect(runWrangler).toHaveBeenCalledTimes(1);
		expect(runWrangler).not.toHaveBeenCalledWith(expect.anything(), ["login"], expect.anything());
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("CLOUDFLARE_API_TOKEN"));
	});

	it("forces WRANGLER_LOG=log when reading the token from wrangler", async () => {
		vi.mocked(runWrangler).mockReturnValue({
			success: true,
			stdout: JSON.stringify({ type: "api_token", token: "test-token" }),
			stderr: "",
		});

		await ensureR2Bucket("/tmp/app", "test-bucket");

		expect(runWrangler).toHaveBeenCalledWith(
			expect.anything(),
			["auth", "token", "--json"],
			expect.objectContaining({ env: expect.objectContaining({ WRANGLER_LOG: "log" }) })
		);
	});
});
