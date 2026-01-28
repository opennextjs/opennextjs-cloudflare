import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock the R2 bucket
const mockR2Bucket = {
	put: vi.fn(),
};

// Create a mock env
const createMockEnv = (token?: string) => ({
	OPEN_NEXT_CACHE_POPULATE_TOKEN: token,
	NEXT_INC_CACHE_R2_BUCKET: token ? mockR2Bucket : undefined,
});

// Import the handler after setting up mocks
import { handleCachePopulate, CACHE_POPULATE_PATH, CACHE_POPULATE_TOKEN_ENV_NAME } from "./cache-populate-handler.js";

describe("cache-populate-handler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("CACHE_POPULATE_PATH", () => {
		test("has the correct path", () => {
			expect(CACHE_POPULATE_PATH).toBe("/_open-next/cache/populate");
		});
	});

	describe("CACHE_POPULATE_TOKEN_ENV_NAME", () => {
		test("has the correct env name", () => {
			expect(CACHE_POPULATE_TOKEN_ENV_NAME).toBe("OPEN_NEXT_CACHE_POPULATE_TOKEN");
		});
	});

	describe("handleCachePopulate", () => {
		test("rejects non-POST requests", async () => {
			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "GET",
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(405);
			expect(await response.text()).toBe("Method not allowed");
		});

		test("returns 403 when token is not configured", async () => {
			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				body: JSON.stringify({ entries: [] }),
			});
			const env = createMockEnv() as unknown as CloudflareEnv;

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(403);
			expect(await response.text()).toBe("Cache population not enabled");
		});

		test("returns 401 when token is missing from request", async () => {
			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				body: JSON.stringify({ entries: [] }),
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(401);
			expect(await response.text()).toBe("Unauthorized");
		});

		test("returns 401 when token is incorrect", async () => {
			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				headers: {
					Authorization: "Bearer wrong-token",
				},
				body: JSON.stringify({ entries: [] }),
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(401);
			expect(await response.text()).toBe("Unauthorized");
		});

		test("returns 400 for invalid JSON body", async () => {
			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
				},
				body: "not json",
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid JSON body");
		});

		test("returns 400 when entries is not an array", async () => {
			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ entries: "not an array" }),
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid request: entries must be an array");
		});

		test("successfully writes entries to R2", async () => {
			mockR2Bucket.put.mockResolvedValue(undefined);

			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					entries: [
						{ key: "cache/key1", value: '{"data":"value1"}' },
						{ key: "cache/key2", value: '{"data":"value2"}' },
					],
				}),
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

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

			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					entries: [
						{ key: "cache/key1", value: '{"data":"value1"}' },
						{ key: "cache/key2", value: '{"data":"value2"}' },
					],
				}),
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

			const response = await handleCachePopulate(request, env);

			expect(response.status).toBe(207); // Multi-Status for partial success
			const body = await response.json();
			expect(body.success).toBe(false);
			expect(body.written).toBe(1);
			expect(body.failed).toBe(1);
			expect(body.errors).toBeDefined();
			expect(body.errors.length).toBe(1);
		});

		test("handles empty entries array", async () => {
			const request = new Request("https://example.com/_open-next/cache/populate", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ entries: [] }),
			});
			const env = createMockEnv("test-token") as unknown as CloudflareEnv;

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
