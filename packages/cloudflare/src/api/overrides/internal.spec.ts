import { describe, expect, it } from "vitest";

import { workerNowMs } from "./internal.js";

describe("workerNowMs", () => {
	it("returns performance.timeOrigin + performance.now() rounded to milliseconds", () => {
		const expected = Math.round(performance.timeOrigin + performance.now());
		expect(workerNowMs()).toBe(expected);
	});

	it("tracks wall clock time within a reasonable delta of Date.now()", () => {
		expect(Math.abs(workerNowMs() - Date.now())).toBeLessThan(1_000);
	});
});
