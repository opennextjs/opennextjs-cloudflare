import { describe, expect, test } from "vitest";

import { validateNodeMiddlewareSource } from "./middleware.js";

describe("validateNodeMiddlewareSource", () => {
	test("allows Workers-compatible proxy code", () => {
		const issues = validateNodeMiddlewareSource(`
			import { NextResponse } from "next/server";

			export default function proxy(request) {
				const response = NextResponse.next({
					headers: { "x-id": crypto.randomUUID() },
				});
				response.cookies.set("seen", request.cookies.get("id")?.value ?? "none");
				return response;
			}
		`);

		expect(issues).toEqual([]);
	});

	test.each(["node:child_process", "child_process", "node:cluster", "worker_threads"])(
		"rejects unsupported module %s",
		(moduleName) => {
			const issues = validateNodeMiddlewareSource(`import test from "${moduleName}";`);

			expect(issues).toHaveLength(1);
			expect(issues[0]?.message).toContain(`"${moduleName}"`);
		}
	);

	test("rejects filesystem imports", () => {
		const issues = validateNodeMiddlewareSource(`import { readFile } from "node:fs/promises";`);

		expect(issues).toHaveLength(1);
		expect(issues[0]?.message).toContain("persistent filesystem access");
	});

	test("allows type-only imports and exports from unsupported runtime modules", () => {
		const issues = validateNodeMiddlewareSource(`
			import type { Stats } from "node:fs";
			export type { Stats } from "node:fs";
		`);

		expect(issues).toEqual([]);
	});

	test("still rejects value imports and exports from unsupported runtime modules", () => {
		const issues = validateNodeMiddlewareSource(`
			import { readFileSync } from "node:fs";
			export { readFileSync } from "node:fs";
		`);

		expect(issues).toHaveLength(2);
		expect(issues.every((issue) => issue.message.includes("persistent filesystem access"))).toBe(true);
	});

	test("rejects native addons", () => {
		const issues = validateNodeMiddlewareSource(`const addon = require("./native.node");`);

		expect(issues.some((issue) => issue.message.includes("native addon"))).toBe(true);
	});

	test("rejects dynamic module loading", () => {
		const issues = validateNodeMiddlewareSource(`
			const name = "child_process";
			const childProcess = require(name);
			const module = await import(name);
		`);

		expect(issues.map((issue) => issue.message)).toEqual([
			"uses dynamic require(); only statically analyzable imports are supported",
			"uses dynamic import(); only statically analyzable imports are supported",
		]);
	});
});
