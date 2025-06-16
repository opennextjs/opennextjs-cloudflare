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

  test("fetch an image allowed by remotePatterns", async ({ page }) => {
    const res = await page.request.get("/_next/image?url=https://avatars.githubusercontent.com/u/248818");
    expect(res.status()).toBe(200);
    expect(res.headers()).toMatchObject({ "content-type": "image/jpeg" });
  });

  test("404 when fetching an image disallowed by remotePatterns", async ({ page }) => {
    const res = await page.request.get("/_next/image?url=https://avatars.githubusercontent.com/u/248817");
    expect(res.status()).toBe(400);
  });
});
