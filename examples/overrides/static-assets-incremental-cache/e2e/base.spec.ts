import { test, expect } from "@playwright/test";

test.describe("static-assets-incremental-cache", () => {
  test("the index page should work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Hello from a Statically generated page")).toBeVisible();
  });

  test("the index page should keep the same date on reload", async ({ page }) => {
    await page.goto("/");
    const date = await page.getByTestId("date-local").textContent();
    expect(date).not.toBeNull();
    await page.reload();
    const newDate = await page.getByTestId("date-local").textContent();
    expect(date).toEqual(newDate);
  });

  test("the index page should keep the same data on reload when trying to use revalidateTag", async ({
    page,
  }) => {
    await page.goto("/");
    const date = await page.getByTestId("date-fetched").textContent();
    await page.getByTestId("revalidate-tag").click();
    await page.waitForTimeout(100);
    await page.reload();
    const newDate = await page.getByTestId("date-fetched").textContent();
    expect(date).toEqual(newDate);
  });

  test("the index page should keep the same data on reload when trying to use revalidatePath", async ({
    page,
  }) => {
    await page.goto("/");
    const date = await page.getByTestId("date-fetched").textContent();
    await page.getByTestId("revalidate-path").click();
    await page.waitForTimeout(100);
    await page.reload();
    const newDate = await page.getByTestId("date-fetched").textContent();
    expect(date).toEqual(newDate);
  });
});
