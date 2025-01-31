import { expect, test } from "@playwright/test";

/**
 * Tests that the request.url is the deployed host and not localhost
 *
 * This test is skipped since e2e tests for the cloudflare adapter
 * run only locally to the baseURL doesn't match
 */
test.skip("Request.url is host", async ({ baseURL, page }) => {
  await page.goto("/api/host");

  const el = page.getByText(`{"url":"${baseURL}/api/host"}`);
  await expect(el).toBeVisible();
});
