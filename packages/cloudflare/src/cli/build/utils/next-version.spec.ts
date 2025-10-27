import mockFs from "mock-fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getNextJSVersion, getNextMajorVersion, isNextJS16OrHigher, isNextJSVersionOrHigher } from "./next-version.js";

describe("next-version", () => {
	beforeEach(() => {
		mockFs({});
	});

	afterEach(() => {
		mockFs.restore();
	});

	describe("getNextJSVersion", () => {
		it("should extract Next.js version from dependencies", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						next: "^15.0.0",
					},
				}),
			});

			const result = getNextJSVersion(".");
			expect(result).toBe("^15.0.0");
		});

		it("should extract Next.js version from devDependencies", () => {
			mockFs({
				"package.json": JSON.stringify({
					devDependencies: {
						next: "^16.0.0-beta.1",
					},
				}),
			});

			const result = getNextJSVersion(".");
			expect(result).toBe("^16.0.0-beta.1");
		});

		it("should prefer dependencies over devDependencies", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						next: "^15.0.0",
					},
					devDependencies: {
						next: "^16.0.0",
					},
				}),
			});

			const result = getNextJSVersion(".");
			expect(result).toBe("^15.0.0");
		});

		it("should return null when Next.js is not found", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						react: "^18.0.0",
					},
				}),
			});

			const result = getNextJSVersion(".");
			expect(result).toBe(null);
		});

		it("should return null when package.json does not exist", () => {
			mockFs({});

			const result = getNextJSVersion(".");
			expect(result).toBe(null);
		});

		it("should handle malformed package.json", () => {
			mockFs({
				"package.json": "invalid json",
			});

			const result = getNextJSVersion(".");
			expect(result).toBe(null);
		});
	});

	describe("isNextJS16OrHigher", () => {
		it("should return true for Next.js 16", () => {
			const result = isNextJS16OrHigher("16.0.0");
			expect(result).toBe(true);
		});

		it("should return true for Next.js 17", () => {
			const result = isNextJS16OrHigher("17.0.0");
			expect(result).toBe(true);
		});

		it("should return false for Next.js 15", () => {
			const result = isNextJS16OrHigher("15.0.0");
			expect(result).toBe(false);
		});

		it("should return false for Next.js 14", () => {
			const result = isNextJS16OrHigher("14.2.5");
			expect(result).toBe(false);
		});

		it("should return false when no version is provided", () => {
			const result = isNextJS16OrHigher("");
			expect(result).toBe(false);
		});

		it("should handle versions with prefixes", () => {
			const result = isNextJS16OrHigher("^16.0.0");
			expect(result).toBe(true);
		});

		it("should handle beta versions", () => {
			const result = isNextJS16OrHigher("16.0.0-beta.1");
			expect(result).toBe(true);
		});

		it("should handle canary versions", () => {
			const result = isNextJS16OrHigher("16.0.0-canary.123");
			expect(result).toBe(true);
		});

		it("should return false for invalid version strings", () => {
			const result = isNextJS16OrHigher("latest");
			expect(result).toBe(false);
		});
	});

	describe("isNextJSVersionOrHigher", () => {
		it("should return true when version is higher than target", () => {
			const result = isNextJSVersionOrHigher("15.2.0", "15.0.0");
			expect(result).toBe(true);
		});

		it("should return true when version equals target", () => {
			const result = isNextJSVersionOrHigher("15.0.0", "15.0.0");
			expect(result).toBe(true);
		});

		it("should return false when version is lower than target", () => {
			const result = isNextJSVersionOrHigher("14.2.0", "15.0.0");
			expect(result).toBe(false);
		});

		it("should return false when no version is provided", () => {
			const result = isNextJSVersionOrHigher("", "15.0.0");
			expect(result).toBe(false);
		});

		it("should handle versions with prefixes", () => {
			const result = isNextJSVersionOrHigher("^15.2.0", "15.0.0");
			expect(result).toBe(true);
		});
	});

	describe("getNextMajorVersion", () => {
		it("should return major version number", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						next: "^15.2.3",
					},
				}),
			});

			const result = getNextMajorVersion(".");
			expect(result).toBe(15);
		});

		it("should work with exact versions", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						next: "16.0.0",
					},
				}),
			});

			const result = getNextMajorVersion(".");
			expect(result).toBe(16);
		});

		it("should work with tilde versions", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						next: "~14.1.0",
					},
				}),
			});

			const result = getNextMajorVersion(".");
			expect(result).toBe(14);
		});

		it("should return null when no version is found", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						react: "^18.0.0",
					},
				}),
			});

			const result = getNextMajorVersion(".");
			expect(result).toBe(null);
		});

		it("should return null for invalid version strings", () => {
			mockFs({
				"package.json": JSON.stringify({
					dependencies: {
						next: "latest",
					},
				}),
			});

			const result = getNextMajorVersion(".");
			expect(result).toBe(null);
		});
	});
});