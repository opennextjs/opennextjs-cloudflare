import { test, expect } from "@playwright/test";

test("cloudflare context env object is populated", async ({ page }) => {
  await page.goto("/middleware");
  const cloudflareContextHeaderElement = page.getByTestId("cloudflare-context-header");
  expect(await cloudflareContextHeaderElement.textContent()).toContain(
    "variables from `cloudflareContext.env`: MY_KV, MY_VAR"
  );
});
