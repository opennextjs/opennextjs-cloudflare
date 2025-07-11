import { expect, test } from "@playwright/test";
/**
 * This tests that the "redirect" config in next.config.js works
 * 
 * redirects: () => {
    return [
      {
        source: "/next-config-redirect",
        destination: "/config-redirect",
        permanent: true,
        missing: [{ type: "cookie", key: "missing-cookie" }],
      },
    ];
  },
 */
test.describe("Next Config Redirect", () => {
	test("Missing cookies", async ({ page }) => {
		await page.goto("/");
		await page.goto("/next-config-redirect-missing");

		await page.waitForURL("/config-redirect?missing=true");

		const el = page.getByText("I was redirected from next.config.js", {
			exact: true,
		});
		await expect(el).toBeVisible();
	});
	test("Not missing cookies", async ({ page }) => {
		await page.goto("/");
		await page.goto("/next-config-redirect-not-missing");

		// the cookie was not missing, so no redirects
		await page.waitForURL("/next-config-redirect-not-missing");

		const el = page.getByText("This page could not be found.", {
			exact: true,
		});
		await expect(el).toBeVisible();
	});
	test("Has cookies", async ({ page }) => {
		await page.goto("/");
		await page.goto("/next-config-redirect-has");

		await page.waitForURL("/config-redirect?has=true");

		const el = page.getByText("I was redirected from next.config.js", {
			exact: true,
		});
		await expect(el).toBeVisible();
	});
	test("Has cookies with value", async ({ page }) => {
		await page.goto("/");
		await page.goto("/next-config-redirect-has-with-value");

		await page.waitForURL("/config-redirect?hasWithValue=true");

		const el = page.getByText("I was redirected from next.config.js", {
			exact: true,
		});
		await expect(el).toBeVisible();
	});
	test("Has cookies with bad value", async ({ page }) => {
		await page.goto("/");
		await page.goto("/next-config-redirect-has-with-bad-value");

		// did not redirect
		await page.waitForURL("/next-config-redirect-has-with-bad-value");

		// 404 not found
		const el = page.getByText("This page could not be found.", {
			exact: true,
		});
		await expect(el).toBeVisible();
	});
});
