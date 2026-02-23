import { beforeEach, describe, expect, test, vi } from "vitest";

import handler from "./r2-cache.ts";
import { ERR_BINDING_NOT_FOUND, ERR_INVALID_REQUEST, ERR_WRITE_FAILED } from "./r2-cache-types.ts";

const mockPut = vi.fn();
const mockR2Bucket = { put: mockPut } as unknown as R2Bucket;

describe("r2-cache worker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	describe("routing", () => {
		test("returns 404 for non-POST requests", async () => {
			const request = new Request("https://example.com/populate", { method: "GET" });

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(404);
		});

		test("returns 404 for wrong pathname", async () => {
			const request = new Request("https://example.com/other", {
				method: "POST",
				body: new FormData(),
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(404);
		});
	});

	describe("binding validation", () => {
		test("returns ERR_BINDING_NOT_FOUND when R2 binding is missing", async () => {
			const formData = new FormData();
			formData.set("key", "k");
			formData.set("value", "v");
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: formData,
			});

			const response = await handler.fetch(request, { R2: undefined });
			expect(response.status).toBe(500);

			const body = await response.json();
			expect(body).toEqual({
				success: false,
				error: expect.stringContaining("not configured"),
				code: ERR_BINDING_NOT_FOUND,
			});
		});
	});

	describe("FormData validation", () => {
		test("returns ERR_INVALID_REQUEST for non-FormData body", async () => {
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: "not form data",
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body).toEqual({
				success: false,
				error: "Invalid FormData body",
				code: ERR_INVALID_REQUEST,
			});
		});

		test("returns ERR_INVALID_REQUEST when key is missing", async () => {
			const formData = new FormData();
			formData.set("value", "v");
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: formData,
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe(ERR_INVALID_REQUEST);
		});

		test("returns ERR_INVALID_REQUEST when value is missing", async () => {
			const formData = new FormData();
			formData.set("key", "k");
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: formData,
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe(ERR_INVALID_REQUEST);
		});

		test("returns ERR_INVALID_REQUEST when both key and value are missing", async () => {
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: new FormData(),
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe(ERR_INVALID_REQUEST);
		});
	});

	describe("R2 write", () => {
		test("returns success for a valid key/value write", async () => {
			mockPut.mockResolvedValue(undefined);

			const formData = new FormData();
			formData.set("key", "cache/key1");
			formData.set("value", '{"data":"value1"}');
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: formData,
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toEqual({ success: true });

			expect(mockPut).toHaveBeenCalledWith("cache/key1", '{"data":"value1"}');
		});

		test("returns ERR_WRITE_FAILED when R2 put fails after all retries", async () => {
			mockPut.mockRejectedValue(new Error("R2 storage error"));

			const formData = new FormData();
			formData.set("key", "cache/key1");
			formData.set("value", "v");
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: formData,
			});

			// Advance through all retry delays: 200, 400, 800, 1600 ms
			const fetchPromise = handler.fetch(request, { R2: mockR2Bucket });
			await vi.advanceTimersByTimeAsync(200 + 400 + 800 + 1600);

			const response = await fetchPromise;
			expect(response.status).toBe(500);

			const body = await response.json();
			expect(body).toEqual({
				success: false,
				error: expect.stringContaining("cache/key1"),
				code: ERR_WRITE_FAILED,
			});
			expect(body.error).toContain("R2 storage error");
			expect(body.error).toContain("5 attempts");
			expect(mockPut).toHaveBeenCalledTimes(5);
		});
	});

	describe("retry logic", () => {
		test("retries on transient R2 write failure and succeeds", async () => {
			mockPut.mockRejectedValueOnce(new Error("transient error")).mockResolvedValueOnce(undefined);

			const formData = new FormData();
			formData.set("key", "cache/key1");
			formData.set("value", "v");
			const fetchPromise = handler.fetch(
				new Request("https://example.com/populate", { method: "POST", body: formData }),
				{ R2: mockR2Bucket }
			);

			// First attempt fails immediately, then sleep(200) before attempt 2.
			await vi.advanceTimersByTimeAsync(200);

			const response = await fetchPromise;
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toEqual({ success: true });
			expect(mockPut).toHaveBeenCalledTimes(2);
		});

		test("exhausts all retries with exponential backoff", async () => {
			mockPut.mockRejectedValue(new Error("persistent error"));

			const formData = new FormData();
			formData.set("key", "cache/key1");
			formData.set("value", "v");
			const fetchPromise = handler.fetch(
				new Request("https://example.com/populate", { method: "POST", body: formData }),
				{ R2: mockR2Bucket }
			);

			// attempt 0: immediate, fails
			// attempt 1: sleep(200), fails
			await vi.advanceTimersByTimeAsync(200);
			// attempt 2: sleep(400), fails
			await vi.advanceTimersByTimeAsync(400);
			// attempt 3: sleep(800), fails
			await vi.advanceTimersByTimeAsync(800);
			// attempt 4: sleep(1600), fails
			await vi.advanceTimersByTimeAsync(1600);

			const response = await fetchPromise;
			expect(response.status).toBe(500);

			const body = await response.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe(ERR_WRITE_FAILED);
			expect(body.error).toContain("5 attempts");
			expect(mockPut).toHaveBeenCalledTimes(5);
		});

		test("succeeds on last retry attempt", async () => {
			mockPut
				.mockRejectedValueOnce(new Error("fail 1"))
				.mockRejectedValueOnce(new Error("fail 2"))
				.mockRejectedValueOnce(new Error("fail 3"))
				.mockRejectedValueOnce(new Error("fail 4"))
				.mockResolvedValueOnce(undefined);

			const formData = new FormData();
			formData.set("key", "cache/key1");
			formData.set("value", "v");
			const fetchPromise = handler.fetch(
				new Request("https://example.com/populate", { method: "POST", body: formData }),
				{ R2: mockR2Bucket }
			);

			// attempt 1: sleep(200)
			await vi.advanceTimersByTimeAsync(200);
			// attempt 2: sleep(400)
			await vi.advanceTimersByTimeAsync(400);
			// attempt 3: sleep(800)
			await vi.advanceTimersByTimeAsync(800);
			// attempt 4: sleep(1600)
			await vi.advanceTimersByTimeAsync(1600);

			const response = await fetchPromise;
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toEqual({ success: true });
			expect(mockPut).toHaveBeenCalledTimes(5);
		});
	});
});
