import { expect, test, type APIRequestContext } from "@playwright/test";

const RUNTIME_PREFETCH = { rsc: "1", "next-router-prefetch": "2" };
const SEGMENT_PREFETCH = { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" };

async function runtimePrefetch(request: APIRequestContext, path: string, session: string) {
	const response = await request.get(path, { headers: { ...RUNTIME_PREFETCH, "x-session": session } });

	expect(response.status()).toEqual(200);
	expect(response.headers()["content-type"]).toContain("text/x-component");
	return response.text();
}

test.describe("Cache Components staged rendering", () => {
	test("a runtime prefetch contains the shell and the request content", async ({ request }) => {
		const body = await runtimePrefetch(request, "/runtime-prefetch/one", "xyz");

		// A runtime prefetch that leaves content to the navigation starts with `~`.
		expect(body.startsWith("~")).toBe(true);
		expect(body).toContain("Runtime shell");
		expect(body).toContain('"Runtime session: ","xyz"');
		expect(body).not.toContain("Runtime dynamic");
	});

	test("a shell that awaits many times is not cut off", async ({ request }) => {
		const body = await runtimePrefetch(request, "/deep-shell/one", "abc");

		expect(body).toContain("deep-leaf");
		expect(body).toContain('"Deep session: ","abc"');
	});

	test("overlapping runtime prefetches are complete and keep their own request content", async ({
		request,
	}) => {
		const sessions = Array.from({ length: 12 }, (_, index) => `session-${index}`);
		const [deep, large] = await Promise.all([
			Promise.all(sessions.map((session) => runtimePrefetch(request, "/deep-shell/one", session))),
			Promise.all(sessions.map((session) => runtimePrefetch(request, "/large-shell/one", session))),
		]);

		for (const [index, body] of deep.entries()) {
			expect(body, `prefetch ${index} lost the end of its shell`).toContain("deep-leaf");
			expect(body, `prefetch ${index} has the content of another request`).toContain(
				`"Deep session: ","${sessions[index]}"`
			);
		}
		for (const [index, body] of large.entries()) {
			expect(body, `prefetch ${index} lost its last cached block`).toContain('"data-large-block":63');
		}
	});

	test("a route that was not prerendered renders its document and its prefetches", async ({ request }) => {
		const path = `/large-shell/cold-${Date.now()}`;
		const session = `session-${Date.now()}`;

		const document = await request.get(path, { headers: { "x-session": session } });
		const html = await document.text();
		expect(document.status()).toEqual(200);
		expect(html).toContain("</html>");
		expect(html).toContain('data-large-block="63"');
		expect(html).toContain(session);

		const segments = await request.get(path, { headers: SEGMENT_PREFETCH });
		expect(segments.status()).toEqual(200);
		// The page has a random value. Next.js reports an error row when it reaches a prerender.
		expect(await segments.text()).not.toMatch(/^\w+:E\{/m);

		const prefetch = await runtimePrefetch(request, path, session);
		expect(prefetch).toContain('"data-large-block":63');
	});

	// Next.js treats the I/O that it does not track as uncached: only a navigation or a document has it.
	test("a prefetch does not contain data from I/O that completed during the render", async ({ request }) => {
		const body = await runtimePrefetch(request, "/uncached-io/one", "abc");

		expect(body).toContain("Uncached I/O");
		expect(body).not.toContain("Uncached render");
	});

	test("a route that was not prerendered does not cache data from I/O that completed during its render", async ({
		request,
	}) => {
		const path = `/uncached-io/cold-${Date.now()}`;
		const renders: string[] = [];

		// The first request renders the route, the next ones use what that render cached.
		for (let attempt = 0; attempt < 4; attempt++) {
			const document = await request.get(path);
			expect(document.status()).toEqual(200);
			renders.push((await document.text()).match(/Uncached render (?:<!-- -->)?(\d+)/)?.[1] ?? "none");
		}

		expect(renders).not.toContain("none");
		expect(new Set(renders).size).toEqual(renders.length);
	});

	test("a Worker service binding stays dynamic across prefetch and document requests", async ({
		request,
	}) => {
		const path = `/service-binding/cold-${Date.now()}`;
		const bindingValue = async () => {
			const document = await request.get(path);
			expect(document.status()).toEqual(200);
			const html = await document.text();
			expect(html).toContain("</html>");
			expect(html).toContain("Cached service binding shell");
			const values = [...new Set(html.match(/service-binding-value-\d+/g))];
			expect(values).toHaveLength(1);
			return values[0];
		};

		const firstValue = await bindingValue();
		const prefetch = await runtimePrefetch(request, path, "binding-test");
		expect(prefetch).toContain("Cached service binding shell");
		expect(prefetch).not.toContain("service-binding-value-");
		expect(await bindingValue()).not.toEqual(firstValue);
	});

	test("a client navigation shows the request content without a document reload", async ({ page }) => {
		const session = `session-${Date.now()}`;
		await page.setExtraHTTPHeaders({ "x-session": session });
		await page.goto("/large-shell/navigation-first");

		// Next.js keeps the previous page in the document, hidden, so select the content by its text.
		const dynamicContent = (slug: string) =>
			page.getByTestId("large-dynamic").filter({ hasText: `Large dynamic: ${slug}:${session}:` });

		await expect(dynamicContent("navigation-first")).toBeVisible();
		await page.getByRole("link", { name: "Large shell second item" }).click();
		await page.waitForURL("/large-shell/navigation-second");
		await expect(dynamicContent("navigation-second")).toBeVisible();
		expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toEqual(1);
	});
});
