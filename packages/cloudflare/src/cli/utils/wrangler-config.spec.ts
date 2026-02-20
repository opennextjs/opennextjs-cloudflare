import { describe, expect, test } from "vitest";

import { getLatestNonFutureCompatDate } from "./wrangler-config.js";

describe("getLatestNonFutureCompatDate", () => {
	const versions = [
		"1.20260129.0",
		"1.20260130.0",
		"1.20260131.0",
		"1.20260203.0",
		"1.20260205.0",
		"1.20260210.0",
		"1.20260219.0",
		"1.20260227.0",
	];

	test.each<[string, string | undefined]>([
		["2026-02-20", "2026-02-19"],
		["2026-02-12", "2026-02-10"],
		["2026-03-01", "2026-02-27"],
		["2026-02-27", "2026-02-27"],
		["2025-01-01", undefined],
	])("today=%s → %s", (today, expected) => {
		expect(getLatestNonFutureCompatDate(versions, today)).toBe(expected);
	});

	test("returns undefined for an empty version list", () => {
		expect(getLatestNonFutureCompatDate([], "2026-02-20")).toBeUndefined();
	});

	test("skips versions that do not match the expected format", () => {
		const mixed = ["not-a-version", "1.20260210.0", "also-invalid", "1.20260227.0"];
		expect(getLatestNonFutureCompatDate(mixed, "2026-02-20")).toBe("2026-02-10");
	});

	test("handles versions not in chronological order", () => {
		const unordered = ["1.20260227.0", "1.20260129.0", "1.20260219.0", "1.20260205.0"];
		expect(getLatestNonFutureCompatDate(unordered, "2026-02-20")).toBe("2026-02-19");
	});
});
