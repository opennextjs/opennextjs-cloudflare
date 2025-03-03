import { expect, test } from "@playwright/test";

test("should not fail on an api route", async ({ page }) => {
  const result = await page.goto("/api/hello");
  expect(result?.status()).toBe(200);
  const body = await result?.json();
  expect(body).toEqual({ hello: "world" });
});
