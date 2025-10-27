import path from "node:path";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    getMiddlewareFileName,
    getMiddlewareHandlerName,
    getMiddlewarePath,
    middlewareFileExists,
} from "./middleware-detector.js";

function createMockOptions(nextVersion: string): BuildOptions {
	return {
		nextVersion,
		appPath: ".",
		buildDir: ".build",
	} as BuildOptions;
}

describe("middleware-detector", () => {
	beforeEach(() => {
		mockFs({});
	});

	afterEach(() => {
		mockFs.restore();
	});

	describe("getMiddlewareFileName", () => {
		it("should return middleware.mjs for Next.js 15", () => {
			mockFs({
				".build/middleware.mjs": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewareFileName(options, ".build");
			expect(result).toBe("middleware.mjs");
		});

		it("should return proxy.mjs for Next.js 16", () => {
			mockFs({
				".build/proxy.mjs": "export default function() {}",
			});

			const options = createMockOptions("16.0.0");
			const result = getMiddlewareFileName(options, ".build");
			expect(result).toBe("proxy.mjs");
		});

		it("should prefer .js extension over .mjs", () => {
			mockFs({
				".build/middleware.js": "export default function() {}",
				".build/middleware.mjs": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewareFileName(options, ".build");
			expect(result).toBe("middleware.js");
		});

		it("should prefer .mjs extension over .ts", () => {
			mockFs({
				".build/middleware.mjs": "export default function() {}",
				".build/middleware.ts": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewareFileName(options, ".build");
			expect(result).toBe("middleware.mjs");
		});

		it("should fallback to middleware.mjs for Next.js 15 when no file exists", () => {
			mockFs({});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewareFileName(options, ".build");
			expect(result).toBe("middleware.mjs");
		});

		it("should fallback to proxy.mjs for Next.js 16 when no file exists", () => {
			mockFs({});

			const options = createMockOptions("16.0.0");
			const result = getMiddlewareFileName(options, ".build");
			expect(result).toBe("proxy.mjs");
		});

		it("should handle version with prefixes", () => {
			mockFs({
				".build/proxy.mjs": "export default function() {}",
			});

			const options = createMockOptions("^16.1.0");
			const result = getMiddlewareFileName(options, ".build");
			expect(result).toBe("proxy.mjs");
		});
	});

	describe("getMiddlewarePath", () => {
		it("should return full path to middleware file", () => {
			mockFs({
				".build/middleware.mjs": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewarePath(options, ".build");
			expect(result).toBe(path.join(".build", "middleware.mjs"));
		});
	});

	describe("getMiddlewareHandlerName", () => {
		it("should return handler name without extension", () => {
			mockFs({
				".build/middleware.mjs": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewareHandlerName(options, ".build");
			expect(result).toBe("middleware");
		});

		it("should work with .js extension", () => {
			mockFs({
				".build/middleware.js": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewareHandlerName(options, ".build");
			expect(result).toBe("middleware");
		});

		it("should work with .ts extension", () => {
			mockFs({
				".build/middleware.ts": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = getMiddlewareHandlerName(options, ".build");
			expect(result).toBe("middleware");
		});

		it("should work with proxy files", () => {
			mockFs({
				".build/proxy.mjs": "export default function() {}",
			});

			const options = createMockOptions("16.0.0");
			const result = getMiddlewareHandlerName(options, ".build");
			expect(result).toBe("proxy");
		});
	});

	describe("middlewareFileExists", () => {
		it("should return true when middleware file exists", () => {
			mockFs({
				".build/middleware.mjs": "export default function() {}",
			});

			const options = createMockOptions("15.0.0");
			const result = middlewareFileExists(options, ".build");
			expect(result).toBe(true);
		});

		it("should return false when middleware file does not exist", () => {
			mockFs({});

			const options = createMockOptions("15.0.0");
			const result = middlewareFileExists(options, ".build");
			expect(result).toBe(false);
		});

		it("should return true when proxy file exists for Next.js 16", () => {
			mockFs({
				".build/proxy.mjs": "export default function() {}",
			});

			const options = createMockOptions("16.0.0");
			const result = middlewareFileExists(options, ".build");
			expect(result).toBe(true);
		});
	});
});