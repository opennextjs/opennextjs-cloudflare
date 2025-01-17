import { test, expect } from "@playwright/test";

test("cloudflare context env object is populated", async ({ page }) => {
  await page.goto("/middleware");
  const cloudflareContextHeaderElement = page.getByTestId("cloudflare-context-header");
  // Note: the text in the span is "keys of `cloudflareContext.env`: MY_VAR, MY_KV, ASSETS" for previews
  //       and "keys of `cloudflareContext.env`: MY_VAR, MY_KV" in dev (`next dev`)
  //       that's why we use `toContain` instead of `toEqual`, this is incorrect and the `ASSETS` binding
  //       should ideally also be part of the dev cloudflare context
  //       (this is an upstream wrangler issue: https://github.com/cloudflare/workers-sdk/issues/7812)
  expect(await cloudflareContextHeaderElement.textContent()).toContain(
    "keys of `cloudflareContext.env`: MY_VAR, MY_KV"
  );
});
