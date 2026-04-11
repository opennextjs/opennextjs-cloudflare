import { beforeEach, describe, expect, test, vi } from "vitest";

import handler from "./r2-cache.ts";
import { ERR_BINDING_NOT_FOUND, ERR_INVALID_REQUEST, ERR_WRITE_FAILED } from "./r2-cache-types.ts";

const mockPut = vi.fn();
const mockR2Bucket = { put: mockPut } as unknown as R2Bucket;

describe("r2-cache worker", () => {
	beforeEach(() => {
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
				headers: { "x-opennext-cache-key": "k" },
				body: "v",
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(404);
		});
	});

	describe("binding validation", () => {
		test("returns ERR_BINDING_NOT_FOUND when R2 binding is missing", async () => {
			const request = new Request("https://example.com/populate", {
				method: "POST",
				headers: { "x-opennext-cache-key": "k" },
				body: "v",
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

	describe("request validation", () => {
		test("returns ERR_INVALID_REQUEST when key header is missing", async () => {
			const request = new Request("https://example.com/populate", {
				method: "POST",
				body: "value",
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body).toEqual({
				success: false,
				error: "Request must include x-opennext-cache-key header and a body",
				code: ERR_INVALID_REQUEST,
			});
		});

		test("returns ERR_INVALID_REQUEST when body is missing", async () => {
			const request = new Request("https://example.com/populate", {
				method: "POST",
				headers: { "x-opennext-cache-key": "k" },
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

			const request = new Request("https://example.com/populate", {
				method: "POST",
				headers: { "x-opennext-cache-key": "cache/key1" },
				body: '{"data":"value1"}',
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toEqual({ success: true });
			expect(mockPut).toBeCalledTimes(1);

			for (const [key, value] of mockPut.mock.calls) {
				expect(key).toBe("cache/key1");
				expect(value).toBeInstanceOf(ReadableStream);
				expect(await new Response(value).text()).toBe('{"data":"value1"}');
			}
		});

		test("returns ERR_WRITE_FAILED when R2 put fails", async () => {
			mockPut.mockRejectedValue(new Error("R2 storage error"));

			const request = new Request("https://example.com/populate", {
				method: "POST",
				headers: { "x-opennext-cache-key": "cache/key1" },
				body: "v",
			});

			const response = await handler.fetch(request, { R2: mockR2Bucket });
			expect(response.status).toBe(500);

			const body = await response.json();
			expect(body).toEqual({
				success: false,
				error: expect.stringContaining("cache/key1"),
				code: ERR_WRITE_FAILED,
			});
			expect(body.error).toContain("R2 storage error");
			expect(mockPut).toHaveBeenCalledTimes(1);
		});
	});
});
