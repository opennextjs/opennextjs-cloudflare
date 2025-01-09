import { test, expect } from "@playwright/test";

test("the application's noop index page is visible and it allows navigating to the hello-world api route", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("This application doesn't have")).toBeVisible();
  await page.getByRole("link", { name: "/api/hello" }).click();
  await expect(page.getByText("Hello World!")).toBeVisible();
});

test("the hello-world api GET route works as intended", async ({ page }) => {
  const res = await page.request.get("/api/hello");
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(await res.text()).toEqual("Hello World!");
});

test("returns a hello world string from the cloudflare context env", async ({ page }) => {
  const res = await page.request.get("/api/hello", {
    headers: {
      "from-cloudflare-context": "true",
    },
  });
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(await res.text()).toEqual("Hello World from the cloudflare context!");
});

test("the hello-world api POST route works as intended", async ({ page }) => {
  const res = await page.request.post("/api/hello", { data: "some body" });
  expect(res.headers()["content-type"]).toContain("text/plain");
  await expect(res.text()).resolves.toEqual("Hello post-World! body=some body");
});

test("sets environment variables from the Next.js env file", async ({ page }) => {
  const res = await page.request.get("/api/env");
  await expect(res.json()).resolves.toEqual(expect.objectContaining({ TEST_ENV_VAR: "TEST_VALUE" }));
});

test("returns correct information about the request from a route handler", async ({ page }) => {
  const res = await page.request.get("/api/request");
  // Next.js can fall back to `localhost:3000` or `n` if it doesn't get the host - neither of these are expected.
  const expectedURL = expect.stringMatching(/https?:\/\/localhost:(?!3000)\d+\/api\/request/);
  await expect(res.json()).resolves.toEqual({ nextUrl: expectedURL, url: expectedURL });
});
