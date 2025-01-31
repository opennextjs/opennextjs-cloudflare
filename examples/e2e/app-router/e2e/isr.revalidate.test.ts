import { expect, test } from "@playwright/test";

// Cache (and revalidation) is currently not supported: https://github.com/opennextjs/opennextjs-cloudflare/issues/105
test.skip("Test revalidate", async ({ request }) => {
  const result = await request.get("/api/isr");

  expect(result.status()).toEqual(200);
  const json = await result.json();
  const body = json.body;

  expect(json.status).toEqual(200);
  expect(body.result).toEqual(true);
  expect(body.cacheControl).toEqual("private, no-cache, no-store, max-age=0, must-revalidate");
});
