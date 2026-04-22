import { describe, expect, test } from "vitest";

import { factorManifestValue, factorObjectValues, getOrCreateVarName } from "./load-manifest.js";

describe("getOrCreateVarName", () => {
	test("returns a variable name starting with 'v' followed by a 3-char prefix", () => {
		const prefixMap = new Map<string, string>();
		const varName = getOrCreateVarName("some-value-long-enough-for-hashing", prefixMap);
		expect(varName).toMatch(/^v[0-9a-f]{3}$/);
	});

	test("returns the same variable name for the same value", () => {
		const prefixMap = new Map<string, string>();
		const value = "some-value-long-enough-for-hashing";
		const first = getOrCreateVarName(value, prefixMap);
		const second = getOrCreateVarName(value, prefixMap);
		expect(second).toBe(first);
		expect(prefixMap.size).toBe(1);
	});

	test("returns different variable names for different values", () => {
		const prefixMap = new Map<string, string>();
		const a = getOrCreateVarName("value-a-that-is-long-enough-to-be-factored", prefixMap);
		const b = getOrCreateVarName("value-b-that-is-long-enough-to-be-factored", prefixMap);
		expect(a).not.toBe(b);
		expect(prefixMap.size).toBe(2);
	});

	// SHA1("test-value-135-padding-to-make-it-long") = 8aa7da...
	// SHA1("test-value-152-padding-to-make-it-long") = 8aae79...
	// Both share the 3-char prefix "8aa".
	test("lengthens the new entry on 3-char collision without renaming the first", () => {
		const prefixMap = new Map<string, string>();
		const first = getOrCreateVarName("test-value-135-padding-to-make-it-long", prefixMap);
		const second = getOrCreateVarName("test-value-152-padding-to-make-it-long", prefixMap);

		// The first entry keeps its short 3-char prefix.
		expect(first).toBe("v8aa");
		// The second entry gets a longer prefix to avoid collision.
		expect(second).toBe("v8aae");
		expect(prefixMap.size).toBe(2);
	});

	// SHA1("test-value-241-...") = 47b8f8...
	// SHA1("test-value-404-...") = 47b6fc...
	// SHA1("test-value-748-...") = 47bac4...
	// All three share the 3-char prefix "47b".
	test("handles three-way collision at 3-char prefix", () => {
		const prefixMap = new Map<string, string>();
		const first = getOrCreateVarName("test-value-241-padding-to-make-it-long", prefixMap);
		const second = getOrCreateVarName("test-value-404-padding-to-make-it-long", prefixMap);
		const third = getOrCreateVarName("test-value-748-padding-to-make-it-long", prefixMap);

		// First takes "47b".
		expect(first).toBe("v47b");
		// Second collides at "47b", gets "47b6".
		expect(second).toBe("v47b6");
		// Third collides at "47b" (taken by first), gets "47ba".
		expect(third).toBe("v47ba");
		expect(prefixMap.size).toBe(3);
	});

	// SHA1("test-value-179-...") = 6ce8d80f...
	// SHA1("test-value-548-...") = 6ce8335e...
	// Both share the 4-char prefix "6ce8".
	test("handles collision that requires more than 4 chars to resolve", () => {
		const prefixMap = new Map<string, string>();
		const first = getOrCreateVarName("test-value-179-padding-to-make-it-long", prefixMap);
		const second = getOrCreateVarName("test-value-548-padding-to-make-it-long", prefixMap);

		// First takes "6ce".
		expect(first).toBe("v6ce");
		// Second collides at "6ce", tries "6ce8" — still collides, resolves to "6ce83".
		expect(second).toBe("v6ce8");
		expect(prefixMap.size).toBe(2);
	});

	test("updates prefixMap in place", () => {
		const prefixMap = new Map<string, string>();
		getOrCreateVarName("value-a-that-is-long-enough-to-be-factored", prefixMap);
		expect(prefixMap.size).toBe(1);
		const [prefix, fullHash] = [...prefixMap.entries()][0]!;
		expect(prefix).toHaveLength(3);
		expect(fullHash).toHaveLength(40);
	});
});

describe("factorManifestValue", () => {
	const makeManifest = (key: string, value: string) =>
		`globalThis.__RSC_MANIFEST["/page"] = { "${key}": ${value} };`;

	test("factors out large values into a variable", () => {
		const values = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const largeValue = JSON.stringify({ a: "x".repeat(50) });
		const manifest = makeManifest("clientModules", largeValue);

		const result = factorManifestValue(manifest, "clientModules", values, prefixMap);

		// The manifest should reference a variable instead of the inline value.
		expect(result).not.toContain(largeValue);
		expect(values.size).toBe(1);
		const [varName, storedValue] = [...values.entries()][0]!;
		expect(varName).toMatch(/^v[0-9a-f]{3,}$/);
		expect(storedValue).toBe(largeValue);
		expect(result).toContain(varName);
		expect(prefixMap.size).toBe(1);
	});

	test("leaves small values untouched", () => {
		const values = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const smallValue = '"small"';
		const manifest = makeManifest("clientModules", smallValue);

		const result = factorManifestValue(manifest, "clientModules", values, prefixMap);

		expect(result).toBe(manifest);
		expect(values.size).toBe(0);
		expect(prefixMap.size).toBe(0);
	});

	test("returns original manifest when key is not found", () => {
		const values = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const manifest = makeManifest("clientModules", '"some-value"');

		const result = factorManifestValue(manifest, "nonExistentKey", values, prefixMap);

		expect(result).toBe(manifest);
		expect(values.size).toBe(0);
	});

	test("reuses variable name for identical values across manifests", () => {
		const values = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const largeValue = JSON.stringify({ a: "x".repeat(50) });
		const manifest1 = makeManifest("clientModules", largeValue);
		const manifest2 = makeManifest("clientModules", largeValue);

		const result1 = factorManifestValue(manifest1, "clientModules", values, prefixMap);
		const result2 = factorManifestValue(manifest2, "clientModules", values, prefixMap);

		// Both should reference the same variable.
		const varName = [...values.keys()][0]!;
		expect(result1).toContain(varName);
		expect(result2).toContain(varName);
		// Only one entry in the values map (same content, same variable).
		expect(values.size).toBe(1);
		expect(prefixMap.size).toBe(1);
	});

	test("factors multiple keys from the same manifest with shared prefixMap", () => {
		const values = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const largeA = JSON.stringify({ a: "a".repeat(50) });
		const largeB = JSON.stringify({ b: "b".repeat(50) });
		const manifest = `globalThis.__RSC_MANIFEST["/page"] = { "clientModules": ${largeA}, "ssrModuleMapping": ${largeB} };`;

		let result = factorManifestValue(manifest, "clientModules", values, prefixMap);
		result = factorManifestValue(result, "ssrModuleMapping", values, prefixMap);

		expect(values.size).toBe(2);
		expect(prefixMap.size).toBe(2);
		// Both variable names should appear in the result.
		for (const varName of values.keys()) {
			expect(result).toContain(varName);
		}
		// Neither large value should appear inline.
		expect(result).not.toContain(largeA);
		expect(result).not.toContain(largeB);
	});
});

describe("factorObjectValues", () => {
	test("deduplicates repeated large chunks arrays", () => {
		const sharedVars = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const chunksArray = JSON.stringify(["chunk-a-long-name.js", "chunk-b-long-name.js"]);
		// Two entries with the same chunks array.
		const input = `{
			"mod1": { "id": "1", "chunks": ${chunksArray} },
			"mod2": { "id": "2", "chunks": ${chunksArray} }
		}`;

		const result = factorObjectValues(input, sharedVars, prefixMap);

		// The chunks array should be replaced by a variable reference.
		expect(sharedVars.size).toBe(1);
		const [varName, storedValue] = [...sharedVars.entries()][0]!;
		expect(varName).toMatch(/^v[0-9a-f]{3,}$/);
		expect(storedValue).toBe(chunksArray);
		// Both occurrences should use the same variable.
		const varOccurrences = result.split(varName).length - 1;
		expect(varOccurrences).toBe(2);
		expect(prefixMap.size).toBe(1);
	});

	test("skips small chunks arrays", () => {
		const sharedVars = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const input = `{
			"mod1": { "id": "1", "chunks": ["a"] }
		}`;

		const result = factorObjectValues(input, sharedVars, prefixMap);

		expect(result).toBe(input);
		expect(sharedVars.size).toBe(0);
		expect(prefixMap.size).toBe(0);
	});

	test("handles distinct chunks arrays with different variable names", () => {
		const sharedVars = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const chunksA = JSON.stringify(["chunk-alpha-long-name.js", "chunk-beta-long-name.js"]);
		const chunksB = JSON.stringify(["chunk-gamma-long-name.js", "chunk-delta-long-name.js"]);
		const input = `{
			"mod1": { "id": "1", "chunks": ${chunksA} },
			"mod2": { "id": "2", "chunks": ${chunksB} }
		}`;

		const result = factorObjectValues(input, sharedVars, prefixMap);

		expect(sharedVars.size).toBe(2);
		expect(prefixMap.size).toBe(2);
		// Both variable names should appear in the result.
		for (const varName of sharedVars.keys()) {
			expect(result).toContain(varName);
		}
	});

	test("shares the prefixMap with factorManifestValue", () => {
		const values = new Map<string, string>();
		const sharedVars = new Map<string, string>();
		const prefixMap = new Map<string, string>();

		// First, factor a manifest value.
		const largeValue = JSON.stringify({ a: "x".repeat(50) });
		const manifest = `globalThis.__RSC_MANIFEST["/page"] = { "clientModules": ${largeValue} };`;
		factorManifestValue(manifest, "clientModules", values, prefixMap);
		expect(prefixMap.size).toBe(1);

		// Then, factor chunks using the same prefixMap.
		const chunksArray = JSON.stringify(["chunk-a-long-name.js", "chunk-b-long-name.js"]);
		const input = `{ "mod1": { "id": "1", "chunks": ${chunksArray} } }`;
		factorObjectValues(input, sharedVars, prefixMap);

		// The prefixMap should now have 2 entries.
		expect(prefixMap.size).toBe(2);
		// The variable names should be different.
		const allVarNames = [...values.keys(), ...sharedVars.keys()];
		expect(new Set(allVarNames).size).toBe(2);
	});

	test("returns input unchanged when no chunks pairs are found", () => {
		const sharedVars = new Map<string, string>();
		const prefixMap = new Map<string, string>();
		const input = `{ "mod1": { "id": "1", "name": "test" } }`;

		const result = factorObjectValues(input, sharedVars, prefixMap);

		expect(result).toBe(input);
		expect(sharedVars.size).toBe(0);
	});
});
