import { expect, test } from "@playwright/test";

// Regression test for named webpack chunks (`webpackChunkName`).
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1326
test("load a named webpack chunk", async ({ request }) => {
	const response = await request.get("/api/named-chunk");
	expect(response.status()).toEqual(200);
	expect(await response.json()).toEqual({ message: "Loaded from a named webpack chunk" });
});
