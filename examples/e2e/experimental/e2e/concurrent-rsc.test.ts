import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Cache Components state that Next.js keeps per process is shared by every request in a Worker
 * isolate. When such state holds request bound I/O handles, an overlapping request clears a handle it
 * does not own, workerd rejects it with "Cannot perform I/O on behalf of a different request", and the
 * throw escapes mid render — the response never completes and the isolate keeps serving truncated
 * bodies afterwards. Overlapping route and segment RSC prefetches are what a browser issues while
 * hovering links, so they are the cheapest way to force that overlap.
 */

const ROUTE_PREFETCH = { rsc: "1", "next-router-prefetch": "1" };
const SEGMENT_PREFETCH = { ...ROUTE_PREFETCH, "next-router-segment-prefetch": "/_tree" };
// What the router sends on click: a dynamic RSC refetch, not a prefetch.
const NAVIGATION = { rsc: "1", "next-url": "/" };

/**
 * Every response is checked against content it must contain, because a poisoned isolate answers 200
 * with a body that is empty or cut short. Documents carry the prerendered `shell`; `resolvedHtml` and
 * `resolvedRsc` are flushed last, so only a fully rendered response can contain them. Prefetch depth
 * varies by route, but every valid prefetch contains a root model instead of only a close marker.
 *
 * The tracked-import routes await a dynamic import inside the render, which routes through
 * `trackPendingChunkLoad` and the module loading `CacheSignal` — the state this suite guards.
 */
const ROUTES = [
	{
		path: "/ppr",
		shell: "static component that does not change",
		resolvedHtml: "This component should be SSR",
		resolvedRsc: "This component should be SSR",
	},
	{
		path: "/ppr/first",
		shell: "Static shell",
		resolvedHtml: "Dynamic slug: first",
		resolvedRsc: '"data-testid":"dynamic-slug"',
	},
	{
		path: "/ppr/second",
		shell: "Static shell",
		resolvedHtml: "Dynamic slug: second",
		resolvedRsc: '"data-testid":"dynamic-slug"',
	},
	{
		path: "/use-cache/ssr",
		shell: "Cache",
		resolvedHtml: 'data-testid="fully-cached"',
		resolvedRsc: '"data-testid":"fully-cached"',
	},
	{
		path: "/use-cache/isr",
		shell: "Cache",
		resolvedHtml: 'data-testid="fully-cached"',
		resolvedRsc: '"data-testid":"fully-cached"',
	},
	{
		path: "/tracked-import/first",
		shell: "Tracked import shell",
		resolvedHtml: "Imported module for first",
		resolvedRsc: "Imported module for first",
	},
	{
		path: "/tracked-import/second",
		shell: "Tracked import shell",
		resolvedHtml: "Imported module for second",
		resolvedRsc: "Imported module for second",
	},
] as const;

type Route = (typeof ROUTES)[number];

type Fetched = {
	route: Route;
	kind: keyof typeof VARIANTS;
	status: number;
	contentType: string;
	body: Buffer;
};

async function fetchPath(
	request: APIRequestContext,
	route: Route,
	kind: keyof typeof VARIANTS
): Promise<Fetched> {
	const response = await request.get(route.path, {
		headers: VARIANTS[kind],
		maxRedirects: 0,
	});
	return {
		route,
		kind,
		status: response.status(),
		contentType: response.headers()["content-type"] ?? "",
		body: await response.body(),
	};
}

const VARIANTS = {
	document: {} as Record<string, string>,
	route: ROUTE_PREFETCH,
	segment: SEGMENT_PREFETCH,
	navigation: NAVIGATION,
};

function assertComplete(result: Fetched) {
	const where = `${result.kind} ${result.route.path}`;
	const isPrefetch = result.kind === "route" || result.kind === "segment";

	// A poisoned isolate answers 200 with an empty or truncated body, so status alone proves nothing.
	expect(result.status, `${where} should complete`).toEqual(200);

	const body = result.body.toString("utf8");
	if (isPrefetch) {
		// Prefetch depth varies by route: some include the static shell and some only router metadata. A
		// usable response always has a root model; the reported failure had only a one-byte close marker.
		expect(result.contentType, `${where} should be an RSC payload`).toContain("text/x-component");
		expect(body, `${where} should contain a root model`).toContain("0:{");
		expect(body, `${where} should not contain a Flight error record`).not.toMatch(/^\w+:E\{/m);

		if (result.kind === "segment") {
			expect(body, `${where} should contain its router tree`).toContain('"tree"');
			expect(body, `${where} should identify its build`).toContain('"buildId"');
		}
		return;
	}

	expect(body, `${where} should contain its prerendered shell`).toContain(result.route.shell);

	if (result.contentType.includes("text/html")) {
		// Truncated streams lose the closing tag that Next.js flushes last.
		expect(body, `${where} should not be truncated`).toContain("</html>");
		expect(body.replaceAll("<!-- -->", ""), `${where} should have resolved its dynamic hole`).toContain(
			result.route.resolvedHtml
		);
		return;
	}

	expect(result.contentType, `${where} should be an RSC payload`).toContain("text/x-component");

	// A dynamic RSC response has to carry the resolved model, which a truncated Flight stream loses.
	expect(body, `${where} should have resolved its dynamic hole`).toContain(result.route.resolvedRsc);
}

test.describe("concurrent Cache Components requests", () => {
	test("overlapping RSC prefetches all complete without poisoning the isolate", async ({ request }) => {
		for (let round = 0; round < 3; round++) {
			const results = await Promise.all(
				ROUTES.flatMap((route) => [
					fetchPath(request, route, "document"),
					fetchPath(request, route, "route"),
					fetchPath(request, route, "segment"),
				])
			);

			for (const result of results) {
				assertComplete(result);
			}
		}

		// The failure outlives the requests that caused it, so check the isolate still serves traffic.
		for (const route of ROUTES) {
			assertComplete(await fetchPath(request, route, "document"));
		}
	});

	test("a navigation refetch overlapping its partial prefetch completes", async ({ request }) => {
		// Hover starts a partial prefetch; clicking before it settles fires the dynamic refetch while
		// the prefetch request is finishing. The dynamic response must still stream to completion.
		for (const route of ROUTES) {
			const prefetch = fetchPath(request, route, "segment");
			const refetch = fetchPath(request, route, "navigation");

			assertComplete(await refetch);
			assertComplete(await prefetch);
		}

		// A hang shows up on later traffic too, so prove the isolate is still healthy.
		for (const route of ROUTES) {
			assertComplete(await fetchPath(request, route, "navigation"));
		}
	});
});
