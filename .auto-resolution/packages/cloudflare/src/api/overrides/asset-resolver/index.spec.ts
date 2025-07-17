import { describe, expect, test } from "vitest";

import { isUserWorkerFirst } from "./index.js";

describe("isUserWorkerFirst", () => {
	test("run_worker_first = false", () => {
		expect(isUserWorkerFirst(false, "/test")).toBe(false);
		expect(isUserWorkerFirst(false, "/")).toBe(false);
	});

	test("run_worker_first is undefined", () => {
		expect(isUserWorkerFirst(undefined, "/test")).toBe(false);
		expect(isUserWorkerFirst(undefined, "/")).toBe(false);
	});

	test("run_worker_first = true", () => {
		expect(isUserWorkerFirst(true, "/test")).toBe(true);
		expect(isUserWorkerFirst(true, "/")).toBe(true);
	});

	describe("run_worker_first is an array", () => {
		test("positive string match", () => {
			expect(isUserWorkerFirst(["/test.ext"], "/test.ext")).toBe(true);
			expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test.ext")).toBe(true);
			expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test")).toBe(false);
			expect(isUserWorkerFirst(["/before/test.ext"], "/test.ext")).toBe(false);
			expect(isUserWorkerFirst(["/test.ext/after"], "/test.ext")).toBe(false);
		});

		test("negative string match", () => {
			expect(isUserWorkerFirst(["!/test.ext"], "/test.ext")).toBe(false);
			expect(isUserWorkerFirst(["!/a", "!/b", "!/test.ext"], "/test.ext")).toBe(false);
		});

		test("positive patterns", () => {
			expect(isUserWorkerFirst(["/images/*"], "/images/pic.jpg")).toBe(true);
			expect(isUserWorkerFirst(["/images/*"], "/other/pic.jpg")).toBe(false);
		});

		test("negative patterns", () => {
			expect(isUserWorkerFirst(["/*", "!/images/*"], "/images/pic.jpg")).toBe(false);
			expect(isUserWorkerFirst(["/*", "!/images/*"], "/index.html")).toBe(true);
			expect(isUserWorkerFirst(["!/images/*", "/*"], "/images/pic.jpg")).toBe(false);
			expect(isUserWorkerFirst(["!/images/*", "/*"], "/index.html")).toBe(true);
		});
	});
});
