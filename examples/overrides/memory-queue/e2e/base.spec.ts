import { test, expect } from "@playwright/test";

test.describe("memory-queue", () => {
  test("the index page should work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Hello from a Statically generated page")).toBeVisible();
  });

  test("the index page should revalidate", async ({ page }) => {
    await page.goto("/");
    const firstDate = await page.getByTestId("date-local").textContent();
    await page.waitForTimeout(5000);
    await page.reload();

    let newDate = await page.getByTestId("date-local").textContent();
    expect(newDate).toBe(firstDate);

    do {
      await page.reload();
      newDate = await page.getByTestId("date-local").textContent();
      await page.waitForTimeout(1000);
    } while (newDate === firstDate);

    expect(newDate).not.toBe(firstDate);
  });
});
