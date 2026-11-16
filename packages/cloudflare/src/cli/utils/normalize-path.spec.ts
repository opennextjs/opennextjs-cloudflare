import { describe, expect, test } from "vitest";

import { normalizePath } from "./normalize-path.js";

describe("normalizePath", () => {
	test("normalizes Windows path separators on every platform", () => {
		expect(normalizePath(String.raw`C:\project\.next\server\chunk.js`)).toBe(
			"C:/project/.next/server/chunk.js"
		);
	});

	test("leaves POSIX paths unchanged", () => {
		expect(normalizePath("/project/.next/server/chunk.js")).toBe("/project/.next/server/chunk.js");
	});
});
