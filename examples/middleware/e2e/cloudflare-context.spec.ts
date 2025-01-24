import { test, expect } from "@playwright/test";

test("middlewares have access to the cloudflare context", async ({ page }) => {
  await page.goto("/middleware");
  const cloudflareContextHeaderElement = page.getByTestId("cloudflare-context-header");
  expect(await cloudflareContextHeaderElement.textContent()).toContain(
    "typeof `cloudflareContext.env` = object"
  );
});
