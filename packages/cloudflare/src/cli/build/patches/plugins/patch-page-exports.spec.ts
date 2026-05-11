import { describe, expect, test } from "vitest";

import { parseEntryChildFromChunk, transformPageJs } from "./patch-page-exports.js";

describe("parseEntryChildFromChunk", () => {
	test("extracts entryId and childId from an app-page template chunk", () => {
		// Realistic shape: a template chunk wraps the entry module factory and
		// inside its body calls `a.s([...,"handler",...], <childId>)` to vendor
		// the handler onto a child module before re-emitting bindings for the
		// entry's own id.
		const content = `
"use strict";(()=>{
  var a={};
  module.exports=[77553,a=>{a.s([ClientPageRoot,Bar,...], 77553)}];
  a.s(["handler","workAsyncStorage","workUnitAsyncStorage","serverHooks","patchFetch","tree","html","pages","routeModule"], 6473);
})();
`;

		expect(parseEntryChildFromChunk(content)).toEqual({ entryId: "77553", childId: "6473" });
	});

	test("returns null when the entry module id is missing", () => {
		const content = `a.s(["handler","tree"], 6473);`;
		expect(parseEntryChildFromChunk(content)).toBeNull();
	});

	test("returns null when no handler delegation is present", () => {
		const content = `module.exports=[77553,a=>{a.s([Foo], 77553)}];`;
		expect(parseEntryChildFromChunk(content)).toBeNull();
	});

	test("returns null when the handler delegate id equals the entry id (no delegation)", () => {
		const content = `
module.exports=[77553,a=>{}];
a.s(["handler","tree"], 77553);
`;
		expect(parseEntryChildFromChunk(content)).toBeNull();
	});

	test("does not match arrays that mention 'handler' as a substring of another name", () => {
		// The regex requires "handler" as a whole quoted element, surrounded by
		// commas or array boundaries. A name like "myhandlerFn" must not match.
		const content = `
module.exports=[77553,a=>{}];
a.s(["myhandlerFn","tree"], 6473);
`;
		expect(parseEntryChildFromChunk(content)).toBeNull();
	});
});

describe("transformPageJs", () => {
	const entryChildMap = new Map([["27012", "58478"]]);

	test("rewrites the standard page.js terminator into a merge expression", () => {
		const contents = [
			`var R=require("../../chunks/ssr/[turbopack]_runtime.js")("server/app/page.js")`,
			`R.c("server/chunks/ssr/abc.js")`,
			`R.m(27012)`,
			`module.exports=R.m(27012).exports`,
		].join("\n");

		const out = transformPageJs(contents, entryChildMap);
		expect(out).not.toBeNull();
		// Both module ids appear in the rewritten merge
		expect(out).toContain("R.m(27012).exports");
		expect(out).toContain("R.m(58478).exports");
		// Fast path: skip merge when the entry already exposes a handler
		expect(out).toContain("if(typeof _s.handler==='function')return _s");
		// Property-descriptor merge preserves lazy getters
		expect(out).toContain("Object.getOwnPropertyDescriptor");
		// And the original terminator is gone
		expect(out).not.toMatch(/module\.exports\s*=\s*R\.m\(\d+\)\.exports\s*$/);
	});

	test("returns null when the file does not end with the standard terminator", () => {
		const contents = `R.m(27012)\nmodule.exports = somethingElse`;
		expect(transformPageJs(contents, entryChildMap)).toBeNull();
	});

	test("returns null when the entry id is not in the mapping", () => {
		const contents = [`R.m(99999)`, `module.exports=R.m(99999).exports`].join("\n");
		expect(transformPageJs(contents, entryChildMap)).toBeNull();
	});

	test("leaves all other content above the terminator untouched", () => {
		const head = [
			`var R=require("../../chunks/ssr/[turbopack]_runtime.js")("server/app/page.js")`,
			`R.c("server/chunks/ssr/keep-me.js")`,
			`R.c("server/chunks/ssr/and-me.js")`,
		].join("\n");
		const contents = `${head}\nR.m(27012)\nmodule.exports=R.m(27012).exports`;

		const out = transformPageJs(contents, entryChildMap)!;
		expect(out.startsWith(head)).toBe(true);
	});
});
