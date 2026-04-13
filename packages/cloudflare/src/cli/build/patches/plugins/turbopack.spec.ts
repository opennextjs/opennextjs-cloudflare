import { describe, expect, test } from "vitest";

import { patchHashedExternalImports } from "./turbopack.js";

describe("patchHashedExternalImports", () => {
	test("replaces hashed bare package a.y() call", () => {
		const input = `a.y("shiki-43d062b67f27bbdc")`;
		expect(patchHashedExternalImports(input)).toBe(
			`Promise.resolve().then(() => require("shiki"))`
		);
	});

	test("replaces hashed package with subpath a.y() call", () => {
		const input = `a.y("shiki-43d062b67f27bbdc/core")`;
		expect(patchHashedExternalImports(input)).toBe(
			`Promise.resolve().then(() => require("shiki/core"))`
		);
	});

	test("replaces multiple hashed calls in one chunk", () => {
		const input = `a.y("shiki-43d062b67f27bbdc/core");a.y("shiki-43d062b67f27bbdc/wasm")`;
		const result = patchHashedExternalImports(input);
		expect(result).toContain(`Promise.resolve().then(() => require("shiki/core"))`);
		expect(result).toContain(`Promise.resolve().then(() => require("shiki/wasm"))`);
	});

	test("does not replace non-hashed a.y() calls", () => {
		const input = `a.y("react")`;
		expect(patchHashedExternalImports(input)).toBe(`a.y("react")`);
	});

	test("does not replace normal module paths", () => {
		const input = `a.y("next/dist/compiled/@vercel/og/index.node.js")`;
		expect(patchHashedExternalImports(input)).toBe(input);
	});

	test("does not match short hex strings that are not a hash", () => {
		const input = `a.y("pkg-abc123")`;
		expect(patchHashedExternalImports(input)).toBe(input);
	});

	test("handles scoped packages with hash", () => {
		const input = `a.y("@shikijs/core-43d062b67f27bbdc/dist/index.js")`;
		expect(patchHashedExternalImports(input)).toBe(
			`Promise.resolve().then(() => require("@shikijs/core/dist/index.js"))`
		);
	});
});
