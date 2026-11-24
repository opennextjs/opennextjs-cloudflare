import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWrangler } from "../commands/utils/run-wrangler.js";
import { ensureR2Bucket } from "./ensure-r2-bucket.js";

const { MockCloudflare, mockR2BucketsGet, mockR2BucketsCreate } = vi.hoisted(() => {
	const mockR2BucketsGet = vi.fn();
	const mockR2BucketsCreate = vi.fn();

	class MockCloudflare {
		static NotFoundError = class extends Error {};

		accounts = { list: vi.fn(() => []) };

		r2 = {
			buckets: {
				get: mockR2BucketsGet,
				create: mockR2BucketsCreate,
			},
		};
	}

	return { MockCloudflare: vi.fn(MockCloudflare), mockR2BucketsGet, mockR2BucketsCreate };
});

vi.mock("@opennextjs/aws/build/helper.js", () => ({
	findPackagerAndRoot: vi.fn(() => ({ packager: "pnpm", root: "/tmp" })),
}));

vi.mock("../commands/utils/run-wrangler.js", () => ({
	runWrangler: vi.fn(),
}));

vi.mock("cloudflare", () => ({
	default: MockCloudflare,
}));

vi.mock("./ask-account-selection.js", () => ({
	askAccountSelection: vi.fn(),
}));

describe("ensureR2Bucket", () => {
	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account-id");
		mockR2BucketsGet.mockResolvedValue({});
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

	it("passes the jurisdiction to the bucket lookup and creation", async () => {
		vi.mocked(runWrangler).mockReturnValue({
			success: true,
			stdout: JSON.stringify({ type: "api_token", token: "test-token" }),
			stderr: "",
		});
		mockR2BucketsGet.mockRejectedValueOnce(new MockCloudflare.NotFoundError());

		await expect(ensureR2Bucket("/tmp/app", "test-bucket", "eu")).resolves.toEqual({
			success: true,
			bucketName: "test-bucket",
		});
		expect(mockR2BucketsGet).toHaveBeenCalledWith("test-bucket", {
			account_id: "test-account-id",
			"cf-r2-jurisdiction": "eu",
		});
		expect(mockR2BucketsCreate).toHaveBeenCalledWith({
			account_id: "test-account-id",
			name: "test-bucket",
			"cf-r2-jurisdiction": "eu",
		});
	});
});
