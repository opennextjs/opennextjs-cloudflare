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

// The tracked-import routes await a dynamic import inside the render, which routes through
// `trackPendingChunkLoad` and the module loading `CacheSignal` — the state this suite guards.
const PATHS = [
	"/ppr",
	"/ppr/first",
	"/ppr/second",
	"/use-cache/ssr",
	"/use-cache/isr",
	"/tracked-import/first",
	"/tracked-import/second",
];

type Fetched = {
	path: string;
	kind: string;
	status: number;
	contentType: string;
	body: Buffer;
};

async function fetchPath(
	request: APIRequestContext,
	path: string,
	kind: keyof typeof VARIANTS
): Promise<Fetched> {
	const response = await request.get(path, { headers: VARIANTS[kind] });
	return {
		path,
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
	const where = `${result.kind} ${result.path}`;

	// A poisoned isolate answers 200 with an empty or truncated body, so status alone proves nothing.
	expect(result.status, `${where} should complete`).toEqual(200);
	expect(result.body.byteLength, `${where} should not be empty`).toBeGreaterThan(0);

	if (result.contentType.includes("text/html")) {
		// Truncated streams lose the closing tag that Next.js flushes last.
		expect(result.body.toString("utf8"), `${where} should not be truncated`).toContain("</html>");
	} else {
		expect(result.contentType, `${where} should be an RSC payload`).toContain("text/x-component");
	}
}

test.describe("concurrent Cache Components requests", () => {
	test("overlapping RSC prefetches all complete without poisoning the isolate", async ({ request }) => {
		for (let round = 0; round < 3; round++) {
			const results = await Promise.all(
				PATHS.flatMap((path) => [
					fetchPath(request, path, "document"),
					fetchPath(request, path, "route"),
					fetchPath(request, path, "segment"),
				])
			);

			for (const result of results) {
				assertComplete(result);
			}
		}

		// The failure outlives the requests that caused it, so check the isolate still serves traffic.
		for (const path of PATHS) {
			assertComplete(await fetchPath(request, path, "document"));
		}
	});

	test("a navigation refetch overlapping its partial prefetch completes", async ({ request }) => {
		// Hover starts a partial prefetch; clicking before it settles fires the dynamic refetch while
		// the prefetch request is finishing. The dynamic response must still stream to completion.
		for (const path of PATHS) {
			const prefetch = fetchPath(request, path, "segment");
			const refetch = fetchPath(request, path, "navigation");

			assertComplete(await refetch);
			assertComplete(await prefetch);
		}

		// A hang shows up on later traffic too, so prove the isolate is still healthy.
		for (const path of PATHS) {
			assertComplete(await fetchPath(request, path, "navigation"));
		}
	});
});
