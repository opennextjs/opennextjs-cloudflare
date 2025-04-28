import { test, expect } from "@playwright/test";

test.describe("head properly populated", () => {
  test("should properly populate the <head>", async ({ page }) => {
    await page.goto("/head");
    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
    expect(title).toBe("SSR Head");
    expect(description).toBe("SSR");
    expect(favicon).toBe("/favicon.ico");
  });
});
