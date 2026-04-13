import { describe, expect, test } from "vitest";

import { getRequires } from "./dynamic-requires.js";

describe("getRequires", () => {
	test("sorts paths by length descending so longer paths match first", () => {
		const files = ["app/page.js", "test/app/page.js", "page.js"];
		const result = getRequires("id", files, "/server");

		const endsWithPattern = /\.endsWith\("([^"]+)"\)/g;
		const matches = [...result.matchAll(endsWithPattern)].map((m) => m[1]);

		// Longer (more specific) paths should appear before shorter ones
		expect(matches).toEqual(["test/app/page.js", "app/page.js", "page.js"]);
	});

	test("does not mutate the original files array", () => {
		const files = ["b.js", "aa.js", "c.js"];
		const original = [...files];
		getRequires("id", files, "/server");

		expect(files).toEqual(original);
	});
});
