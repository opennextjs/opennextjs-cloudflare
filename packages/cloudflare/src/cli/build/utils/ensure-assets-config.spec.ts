import { describe, expect, test } from "vitest";

import { ensureAssetsConfig } from "./ensure-assets-config.js";

describe("ensureAssetsConfig", () => {
	describe("run_worker_first is not enabled", () => {
		test.each([
			["no assets", undefined],
			["run_worker_first is undefined", { directory: "assets" }],
			["run_worker_first is false", { directory: "assets", run_worker_first: false }],
			["run_worker_first is an empty array", { directory: "assets", run_worker_first: [] }],
			[
				"run_worker_first only has negative patterns",
				{ directory: "assets", run_worker_first: ["!/static/*"] },
			],
		])("does not check the config when %s", (_, assets) => {
			expect(() => ensureAssetsConfig({ ...assets, html_handling: "auto-trailing-slash" })).not.toThrow();
			expect(() =>
				ensureAssetsConfig({ ...assets, not_found_handling: "single-page-application" })
			).not.toThrow();
		});
	});

	describe.each([
		["true", true],
		["an array", ["/protected/*"]],
		["an array with negative patterns", ["!/static/*", "/*"]],
	])("run_worker_first is %s", (_, runWorkerFirst) => {
		test.each(["none", "404-page", undefined] as const)(
			'accepts html_handling: "none" with not_found_handling: %s',
			(notFoundHandling) => {
				expect(() =>
					ensureAssetsConfig({
						run_worker_first: runWorkerFirst,
						html_handling: "none",
						not_found_handling: notFoundHandling,
					})
				).not.toThrow();
			}
		);

		test.each(["auto-trailing-slash", "force-trailing-slash", "drop-trailing-slash", undefined] as const)(
			"throws for html_handling: %s",
			(htmlHandling) => {
				expect(() =>
					ensureAssetsConfig({
						run_worker_first: runWorkerFirst,
						html_handling: htmlHandling,
						not_found_handling: "none",
					})
				).toThrow(/"html_handling": "none"/);
			}
		);

		test('throws for not_found_handling: "single-page-application"', () => {
			expect(() =>
				ensureAssetsConfig({
					run_worker_first: runWorkerFirst,
					html_handling: "none",
					not_found_handling: "single-page-application",
				})
			).toThrow(/"not_found_handling": "single-page-application"/);
		});

		test("throws for unknown values", () => {
			type Assets = Parameters<typeof ensureAssetsConfig>[0];
			expect(() =>
				ensureAssetsConfig({
					run_worker_first: runWorkerFirst,
					html_handling: "none",
					not_found_handling: "unknown",
				} as unknown as Assets)
			).toThrow(/"not_found_handling": "unknown"/);
			expect(() =>
				ensureAssetsConfig({
					run_worker_first: runWorkerFirst,
					html_handling: "unknown",
					not_found_handling: "none",
				} as unknown as Assets)
			).toThrow(/"html_handling": "unknown"/);
		});
	});
});
