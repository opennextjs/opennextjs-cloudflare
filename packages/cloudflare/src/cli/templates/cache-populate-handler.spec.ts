import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock the R2 bucket
const mockR2Bucket = {
	put: vi.fn(),
};

// Create a mock env
const createMockEnv = (withR2 = true) => ({
	NEXT_INC_CACHE_R2_BUCKET: withR2 ? mockR2Bucket : undefined,
});

import { handleCachePopulate } from "./cache-populate-handler.js";

describe("cache-populate-handler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("handleCachePopulate", () => {
		test("rejects non-POST requests", async () => {
			const request = new Request("https://example.com/", {
				method: "GET",
			});
			const env = createMockEnv() as unknown as { NEXT_INC_CACHE_R2_BUCKET: R2Bucket };

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(405);
			expect(await response.text()).toBe("Method not allowed");
		});

		test("returns 500 when R2 bucket is not configured", async () => {
			const request = new Request("https://example.com/", {
				method: "POST",
				body: JSON.stringify({ entries: [] }),
			});
			const env = createMockEnv(false) as unknown as { NEXT_INC_CACHE_R2_BUCKET: R2Bucket };

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(500);
			expect(await response.text()).toBe("R2 bucket not configured");
		});

		test("returns 400 for invalid JSON body", async () => {
			const request = new Request("https://example.com/", {
				method: "POST",
				body: "not json",
			});
			const env = createMockEnv() as unknown as { NEXT_INC_CACHE_R2_BUCKET: R2Bucket };

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid JSON body");
		});

		test("returns 400 when entries is not an array", async () => {
			const request = new Request("https://example.com/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ entries: "not an array" }),
			});
			const env = createMockEnv() as unknown as { NEXT_INC_CACHE_R2_BUCKET: R2Bucket };

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid request: entries must be an array");
		});

		test("successfully writes entries to R2", async () => {
			mockR2Bucket.put.mockResolvedValue(undefined);

			const request = new Request("https://example.com/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					entries: [
						{ key: "cache/key1", value: '{"data":"value1"}' },
						{ key: "cache/key2", value: '{"data":"value2"}' },
					],
				}),
			});
			const env = createMockEnv() as unknown as { NEXT_INC_CACHE_R2_BUCKET: R2Bucket };

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({
				success: true,
				written: 2,
				failed: 0,
			});

			expect(mockR2Bucket.put).toHaveBeenCalledTimes(2);
			expect(mockR2Bucket.put).toHaveBeenCalledWith("cache/key1", '{"data":"value1"}');
			expect(mockR2Bucket.put).toHaveBeenCalledWith("cache/key2", '{"data":"value2"}');
		});

		test("handles partial failures", async () => {
			mockR2Bucket.put
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error("R2 error"));

			const request = new Request("https://example.com/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					entries: [
						{ key: "cache/key1", value: '{"data":"value1"}' },
						{ key: "cache/key2", value: '{"data":"value2"}' },
					],
				}),
			});
			const env = createMockEnv() as unknown as { NEXT_INC_CACHE_R2_BUCKET: R2Bucket };

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(207);
			const body = await response.json();
			expect(body.success).toBe(false);
			expect(body.written).toBe(1);
			expect(body.failed).toBe(1);
			expect(body.errors).toBeDefined();
			expect(body.errors.length).toBe(1);
		});

		test("handles empty entries array", async () => {
			const request = new Request("https://example.com/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ entries: [] }),
			});
			const env = createMockEnv() as unknown as { NEXT_INC_CACHE_R2_BUCKET: R2Bucket };

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({
				success: true,
				written: 0,
				failed: 0,
			});

			expect(mockR2Bucket.put).not.toHaveBeenCalled();
		});
	});
});
