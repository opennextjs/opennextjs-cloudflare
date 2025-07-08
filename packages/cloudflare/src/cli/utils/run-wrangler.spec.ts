import { describe, expect, test } from "vitest";

import { getFlagValue, getWranglerConfigFlag, getWranglerEnvironmentFlag } from "./run-wrangler.js";

describe("getFlagValue", () => {
	test("long", () => {
		expect(getFlagValue(["--flag", "value"], "--flag", "-f")).toEqual("value");
		expect(getFlagValue(["--flag=value"], "--flag", "-f")).toEqual("value");
	});

	test("short", () => {
		expect(getFlagValue(["-f", "value"], "--flag", "-f")).toEqual("value");
		expect(getFlagValue(["-f=value"], "--flag", "-f")).toEqual("value");
	});

	test("not found", () => {
		expect(getFlagValue(["--some", "value"], "--other", "-o")).toBeUndefined();
		expect(getFlagValue(["--some=value"], "--other", "-o")).toBeUndefined();
	});
});

describe("getWranglerEnvironmentFlag", () => {
	test("long", () => {
		expect(getWranglerEnvironmentFlag(["--env", "value"])).toEqual("value");
		expect(getWranglerEnvironmentFlag(["--env=value"])).toEqual("value");
	});

	test("short", () => {
		expect(getWranglerEnvironmentFlag(["-e", "value"])).toEqual("value");
		expect(getWranglerEnvironmentFlag(["-e=value"])).toEqual("value");
	});

	test("not found", () => {
		expect(getWranglerEnvironmentFlag(["--some", "value"])).toBeUndefined();
		expect(getWranglerEnvironmentFlag(["--some=value"])).toBeUndefined();
	});
});

describe("getWranglerConfigFlag", () => {
	test("long", () => {
		expect(getWranglerConfigFlag(["--config", "path/to/wrangler.jsonc"])).toEqual("path/to/wrangler.jsonc");
		expect(getWranglerConfigFlag(["--config=path/to/wrangler.jsonc"])).toEqual("path/to/wrangler.jsonc");
	});

	test("short", () => {
		expect(getWranglerConfigFlag(["-c", "path/to/wrangler.jsonc"])).toEqual("path/to/wrangler.jsonc");
		expect(getWranglerConfigFlag(["-c=path/to/wrangler.jsonc"])).toEqual("path/to/wrangler.jsonc");
	});

	test("not found", () => {
		expect(getWranglerConfigFlag(["--some", "value"])).toBeUndefined();
		expect(getWranglerConfigFlag(["--some=value"])).toBeUndefined();
	});
});
