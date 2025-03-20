import { test, expect } from "@playwright/test";

test.describe("r2-incremental-cache", () => {
  test("the index page should work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Hello from a Statically generated page")).toBeVisible();
  });

  test("the index page should revalidate", async ({ page, request }) => {
    // We need to make sure the page is loaded and is a HIT
    // If it is STALE, the next hit may have an updated date and thus fail the test
    let cacheHeaders = "";
    do {
      const req = await request.get("/");
      cacheHeaders = req.headers()["x-nextjs-cache"];
      await page.waitForTimeout(500);
    } while (cacheHeaders !== "HIT");

    await page.goto("/");
    const firstDate = await page.getByTestId("date-local").textContent();

    await page.reload();
    let newDate = await page.getByTestId("date-local").textContent();
    expect(newDate).toBe(firstDate);

    await page.waitForTimeout(5000);

    do {
      await page.reload();
      newDate = await page.getByTestId("date-local").textContent();
      await page.waitForTimeout(1000);
    } while (newDate === firstDate);

    expect(newDate).not.toBe(firstDate);
  });
});
