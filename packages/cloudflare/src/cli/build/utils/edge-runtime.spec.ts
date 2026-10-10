import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, describe, expect, it } from "vitest";

import { getEdgeRuntimeRoutes, getUnhandledEdgeRuntimeRoutes } from "./edge-runtime.js";

const options = { appBuildOutputPath: "/app" } as BuildOptions;

const manifestPath = "/app/.next/server/middleware-manifest.json";

function info(page: string) {
	return { files: [], name: page, page, matchers: [], wasm: [], assets: [] };
}

describe("getEdgeRuntimeRoutes", () => {
	afterEach(() => mockFs.restore());

	it("returns only the functions and ignores the middleware", () => {
		mockFs({
			[manifestPath]: JSON.stringify({
				version: 3,
				sortedMiddleware: ["/"],
				middleware: { "/": info("/") },
				functions: {
					"/api/hello/route": info("/api/hello/route"),
					"/dashboard/page": info("/dashboard/page"),
				},
			}),
		});

		expect(getEdgeRuntimeRoutes(options)).toEqual(["/api/hello/route", "/dashboard/page"]);
	});

	it("falls back to the key when `page` is missing", () => {
		mockFs({
			[manifestPath]: JSON.stringify({
				version: 3,
				middleware: {},
				functions: { "/api/hello": { files: [], name: "/api/hello" } },
			}),
		});

		expect(getEdgeRuntimeRoutes(options)).toEqual(["/api/hello"]);
	});

	it("returns an empty array when there are no functions", () => {
		mockFs({
			[manifestPath]: JSON.stringify({ version: 3, sortedMiddleware: [], middleware: {}, functions: {} }),
		});

		expect(getEdgeRuntimeRoutes(options)).toEqual([]);
	});

	it("returns an empty array when `functions` is missing", () => {
		mockFs({ [manifestPath]: JSON.stringify({ version: 3, middleware: {} }) });

		expect(getEdgeRuntimeRoutes(options)).toEqual([]);
	});

	it("returns an empty array when the manifest is missing", () => {
		mockFs({ "/app/.next/server": {} });

		expect(getEdgeRuntimeRoutes(options)).toEqual([]);
	});
});

describe("getUnhandledEdgeRuntimeRoutes", () => {
	it("keeps the routes that are not handled by a separate edge function", () => {
		expect(getUnhandledEdgeRuntimeRoutes(["/api/hello/route", "/api/hello", "/"], new Set())).toEqual([
			"/api/hello/route",
			"/api/hello",
			"/",
		]);
	});

	it("drops app router routes handled by a separate edge function", () => {
		expect(
			getUnhandledEdgeRuntimeRoutes(["/api/hello/route", "/dashboard/page"], new Set(["app/api/hello/route"]))
		).toEqual(["/dashboard/page"]);
	});

	it("drops pages router routes handled by a separate edge function", () => {
		expect(
			getUnhandledEdgeRuntimeRoutes(
				["/api/hello", "/", "/about"],
				new Set(["pages/api/hello", "pages/index"])
			)
		).toEqual(["/about"]);
	});
});
