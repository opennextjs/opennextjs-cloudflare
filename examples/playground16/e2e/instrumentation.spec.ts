import { test, expect } from "@playwright/test";

// Note: this app uses a Node.js middleware (`proxy.ts`), so there is no edge middleware
//       (`/middleware-instrumentation`) anymore. Edge runtime instrumentation is covered
//       by playground15 instead.
test.describe("instrumentation", () => {
	test("the instrumentation register hook should work for the nodejs runtime", async ({ page }) => {
		const res = await page.request.get("/api/instrumentation");
		const respJson: Record<string, string> = await res.json();
		expect(respJson["nodejs-instrumentation-setup"]).toEqual(
			"this value has been set by calling the instrumentation `register` callback in the nodejs runtime"
		);
	});

	// Note: we cannot test this since currently both runtimes share the same global scope
	//       (see: https://github.com/opennextjs/opennextjs-cloudflare/issues/408)
	test.describe.skip("isolation", () => {
		test("the instrumentation register hook edge logic should not effect nodejs routes", async ({ page }) => {
			const res = await page.request.get("/api/instrumentation");
			const respJson: Record<string, string> = await res.json();
			expect(respJson["edge-instrumentation-setup"]).toBeUndefined();
		});
	});
});
