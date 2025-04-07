import { expect, test } from "@playwright/test";
import { validateMd5 } from "../../utils";

/*
 * `curl -s https://opennext.js.org/share.png | md5sum`
 * This is the MD5 hash of the image. It is used to validate the image content.
 */
const OPENNEXT_PNG_MD5 = "405f45cc3397b09717a13ebd6f1e027b";

test("Middleware Redirect", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "/Redirect" }).click();

  // URL is immediately redirected
  await page.waitForURL("/redirect-destination");
  let el = page.getByText("Redirect Destination", { exact: true });
  await expect(el).toBeVisible();

  // Loading page should also redirect
  await page.goto("/redirect");
  await page.waitForURL("/redirect-destination");
  expect(await context.cookies().then((res) => res.find((cookie) => cookie.name === "test")?.value)).toBe(
    "success"
  );
  el = page.getByText("Redirect Destination", { exact: true });
  await expect(el).toBeVisible();
});

test("Middleware Rewrite External Image", async ({ page }) => {
  await page.goto("/rewrite-external");
  page.on("response", async (response) => {
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(response.headers()["cache-control"]).toBe("max-age=600");
    const bodyBuffer = await response.body();
    expect(validateMd5(bodyBuffer, OPENNEXT_PNG_MD5)).toBe(true);
  });
});
