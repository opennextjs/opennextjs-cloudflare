import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Next.js renders Cache Components as a pipeline of event loop tasks and expects React to flush each
 * stage before the next one unblocks more content. Its Node.js implementation gets that boundary from
 * `process.nextTick`; workerd implements `process.nextTick` with `queueMicrotask`, so the adapter has
 * to supply the boundary itself. When it slips, the render lands a stage late: a runtime prefetch
 * drops everything that arrives after its final task aborts the render, and a document render reports
 * cached data as uncached and fails with a 500.
 *
 * `/deep-shell/[slug]` is built for this: its shell awaits many times before rendering, so the flush
 * that a broken boundary loses is the shell itself.
 */

const RUNTIME_PREFETCH = { rsc: "1", "next-router-prefetch": "2" };
const ROUTE_PREFETCH = { rsc: "1", "next-router-prefetch": "1" };
const SEGMENT_PREFETCH = { ...ROUTE_PREFETCH, "next-router-segment-prefetch": "/_tree" };

/** Runtime prefetches start with `~` when partial and `#` when complete; anything else is not one. */
function expectRuntimePrefetch(body: Buffer, where: string) {
	expect(body.byteLength, `${where} carried only the partial marker`).toBeGreaterThan(1);
	expect(String.fromCharCode(body[0]!), `${where} should start with a partial marker`).toMatch(/^[~#]$/);
}

async function runtimePrefetch(request: APIRequestContext, path: string, session: string) {
	const response = await request.get(path, {
		headers: { ...RUNTIME_PREFETCH, "x-session": session },
	});
	expect(response.status(), `runtime prefetch ${path} should complete`).toEqual(200);
	expect(response.headers()["content-type"]).toContain("text/x-component");
	return response;
}

test.describe("staged Cache Components rendering", () => {
	test("a runtime prefetch carries the shell it rendered", async ({ request }) => {
		const response = await runtimePrefetch(request, "/runtime-prefetch/one", "xyz");
		const body = await response.body();

		expectRuntimePrefetch(body, "/runtime-prefetch/one");
		const text = body.toString("utf8");
		expect(text).toContain("Runtime shell");
		// Session content resolves in a later stage than the shell, so it proves the pipeline advanced.
		expect(text).toContain("Runtime session: ");
		expect(text).toContain("xyz");
	});

	test("a deep shell reaches the client instead of being cut off mid render", async ({ request }) => {
		const response = await runtimePrefetch(request, "/deep-shell/one", "abc");
		const body = await response.body();

		expectRuntimePrefetch(body, "/deep-shell/one");
		const text = body.toString("utf8");
		// The leaf is the last thing the shell renders: a render that lands a stage late loses it.
		expect(text).toContain("deep-leaf");
		expect(text).toContain("level 0");
		expect(text).toContain("Deep session: ");
		expect(text).toContain("abc");
	});

	test("a deep shell renders its document and prefetches", async ({ request }) => {
		const document = await request.get("/deep-shell/two", { headers: { "x-session": "doc" } });
		const html = await document.text();

		expect(document.status()).toEqual(200);
		expect(html).toContain("</html>");
		expect(html.replaceAll("<!-- -->", "")).toContain("Deep leaf level 0");
		// The dynamic hole resolves through a streamed Flight row, so its text arrives JSON escaped.
		expect(html).toContain("deep-dynamic");
		expect(html).toContain("Deep dynamic: ");

		for (const headers of [ROUTE_PREFETCH, SEGMENT_PREFETCH]) {
			const response = await request.get("/deep-shell/two", { headers });

			expect(response.status(), `prefetch ${JSON.stringify(headers)} should complete`).toEqual(200);
			expect(response.headers()["content-type"]).toContain("text/x-component");
			expect((await response.body()).byteLength).toBeGreaterThan(1);
		}
	});

	test("overlapping runtime prefetches each keep their own shell", async ({ request }) => {
		const sessions = ["a", "b", "c", "d", "e", "f"];
		const responses = await Promise.all(
			sessions.map((session) => runtimePrefetch(request, "/deep-shell/one", session))
		);

		for (const [index, response] of responses.entries()) {
			const body = await response.body();
			const where = `overlapping prefetch ${index}`;

			expectRuntimePrefetch(body, where);
			const text = body.toString("utf8");
			expect(text, `${where} lost its deep shell`).toContain("deep-leaf");
			expect(text, `${where} lost its session content`).toContain(`Deep session: `);
			expect(text, `${where} served another request's session`).toContain(sessions[index]!);
		}
	});

	test("large runtime prefetches are complete across repeated and overlapping renders", async ({
		request,
	}) => {
		const sessions = Array.from({ length: 30 }, (_, index) => `large-${index}`);
		const responses = [];

		for (const session of sessions.slice(0, 10)) {
			responses.push(await runtimePrefetch(request, "/large-shell/one", session));
		}
		responses.push(
			...(await Promise.all(
				sessions.slice(10).map((session) => runtimePrefetch(request, "/large-shell/one", session))
			))
		);

		for (const [index, response] of responses.entries()) {
			const body = await response.body();
			const where = `large prefetch ${index}`;

			expectRuntimePrefetch(body, where);
			expect(body.byteLength, `${where} was truncated`).toBeGreaterThan(60 * 1024);
			const text = body.toString("utf8");
			expect(text, `${where} lost its final cached block`).toContain('"data-large-block":63');
		}
	});

	test("a cold large shell keeps request-time random values out of prerendering", async ({ request }) => {
		const path = `/large-shell/cold-${Date.now()}`;
		const session = `document-session-${Date.now()}`;
		const document = await request.get(path, { headers: { "x-session": session } });
		const html = await document.text();

		expect(document.status()).toEqual(200);
		expect(html).toContain("</html>");
		expect(html).toContain('data-large-block="63"');
		expect(html).toContain("Large dynamic: ");
		expect(html).toContain(session);

		for (const headers of [ROUTE_PREFETCH, SEGMENT_PREFETCH]) {
			const response = await request.get(path, { headers });
			const body = (await response.body()).toString("utf8");

			expect(response.status(), `prefetch ${JSON.stringify(headers)} should complete`).toEqual(200);
			expect(response.headers()["content-type"]).toContain("text/x-component");
			expect(body).toContain("0:{");
			expect(body).not.toMatch(/^\w+:E\{/m);
		}
	});

	test("client navigation to a large dynamic shell does not reload the document", async ({ page }) => {
		const session = `navigation-session-${Date.now()}`;
		await page.setExtraHTTPHeaders({ "x-session": session });
		await page.goto("/large-shell/navigation-first");

		await expect(
			page.getByTestId("large-dynamic").filter({ hasText: `Large dynamic: navigation-first:${session}:` })
		).toBeVisible();
		await page.getByRole("link", { name: "Large shell second item" }).click();
		await page.waitForURL("/large-shell/navigation-second");
		await expect(
			page.getByTestId("large-dynamic").filter({ hasText: `Large dynamic: navigation-second:${session}:` })
		).toBeVisible();
		await expect(page.locator('[data-large-block="63"]:visible')).toBeAttached();
		expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toEqual(1);
	});
});
