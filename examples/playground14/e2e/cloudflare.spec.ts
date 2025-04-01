/**
 * Cloudflare specific tests.
 *
 * The tests in this file do not run on Node (`next dev`).
 */

import { test, expect } from "@playwright/test";

test.describe("playground/cloudflare", () => {
  test("NextConfig", async ({ page }) => {
    const res = await page.request.get("/api/buildid");
    expect(res.status()).toEqual(200);
    const { nextConfig } = await res.json();
    expect(nextConfig.output).toEqual("standalone");
  });

  test("Environment variable defined on process.env are not overridden by .env files", async ({ page }) => {
    const res = await page.request.get("/api/env");
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ PROCESS_ENV_VAR: "process.env" }));
  });
});
