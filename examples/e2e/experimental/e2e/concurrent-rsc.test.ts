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
 * Every response is checked against content the route must contain, because a poisoned isolate answers
 * 200 with a body that is empty or cut short. `shell` is prerendered, so every variant carries it;
 * `resolved` is flushed last, so only a fully rendered response can contain it — that is what proves a
 * stream was not truncated. Prefetches deliberately stop at the shell and are not checked for it.
 *
 * The tracked-import routes await a dynamic import inside the render, which routes through
 * `trackPendingChunkLoad` and the module loading `CacheSignal` — the state this suite guards.
 */
const ROUTES = [
	{ path: "/ppr", shell: "static component that does not change", resolved: "This component should be SSR" },
	{ path: "/ppr/first", shell: "Static shell", resolved: "Dynamic slug: first" },
	{ path: "/ppr/second", shell: "Static shell", resolved: "Dynamic slug: second" },
	{ path: "/use-cache/ssr", shell: "Cache", resolved: "fully-cached" },
	{ path: "/use-cache/isr", shell: "Cache", resolved: "fully-cached" },
	{
		path: "/tracked-import/first",
		shell: "Tracked import shell",
		resolved: "Imported module for first",
	},
	{
		path: "/tracked-import/second",
		shell: "Tracked import shell",
		resolved: "Imported module for second",
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
	const response = await request.get(route.path, { headers: VARIANTS[kind] });
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
	expect(body, `${where} should contain its prerendered shell`).toContain(result.route.shell);

	if (result.contentType.includes("text/html")) {
		// Truncated streams lose the closing tag that Next.js flushes last.
		expect(body, `${where} should not be truncated`).toContain("</html>");
		expect(body, `${where} should have resolved its dynamic hole`).toContain(result.route.resolved);
		return;
	}

	expect(result.contentType, `${where} should be an RSC payload`).toContain("text/x-component");

	// A prefetch stops at the shell by design; a dynamic RSC response has to carry the resolved model,
	// which is the part a truncated Flight stream loses.
	if (!isPrefetch) {
		expect(body, `${where} should have resolved its dynamic hole`).toContain(result.route.resolved);
	}
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
