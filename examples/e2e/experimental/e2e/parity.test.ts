import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { getAppPort } from "../../../common/apps";

/**
 * Compares the worker with Node.js (`next start`) serving the same build, byte for byte.
 *
 * Next.js renders a Cache Components page in stages and decides what a response contains from the
 * stage in which the content is ready. A response that differs from Node.js is then a stage boundary
 * in the wrong place: content is lost, or content that must stay dynamic is included.
 */

const NODE_PORT = getAppPort("experimental", { isWorker: false });
const NODE_URL = `http://localhost:${NODE_PORT}`;

// One worker runs the tests of this file in order, so they share the Node.js server.
test.describe.configure({ mode: "default" });

let nodeServer: ChildProcess;

// The Playwright web server builds the app, so `next start` can only run after it.
test.beforeAll(async () => {
	nodeServer = spawn(
		process.execPath,
		[path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--port", `${NODE_PORT}`],
		{ stdio: "ignore" }
	);

	await expect
		.poll(
			() =>
				fetch(NODE_URL).then(
					() => true,
					() => false
				),
			{ timeout: 60_000 }
		)
		.toBe(true);
	// The port answers but the server exited: another process owns the port, maybe with another build.
	expect(nodeServer.exitCode).toBeNull();
});

test.afterAll(() => {
	nodeServer.kill();
});

const REQUESTS = {
	document: {},
	navigation: { rsc: "1", "next-url": "/" },
	"segment prefetch": { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" },
	"runtime prefetch": { rsc: "1", "next-router-prefetch": "2" },
	"route prefetch": { rsc: "1", "next-router-prefetch": "1" },
} satisfies Record<string, Record<string, string>>;

type RequestKind = keyof typeof REQUESTS;

const ALL_KINDS = Object.keys(REQUESTS) as RequestKind[];

// A route with `use cache` content in its shell differs from Node.js for reasons that are not the
// stage boundaries:
// - Next.js cannot read the postponed state of the route on workerd, because `node:zlib` rejects
//   the `maxOutputLength` that it uses. The document and the route prefetch are then not resumed.
// - A navigation reads the cached content while it renders. The worker reads it from R2 and Node.js
//   from memory, so the rows arrive in a different order.
const WITH_CACHED_SHELL: RequestKind[] = ["segment prefetch", "runtime prefetch"];

const ROUTES: Array<{ path: string; kinds: RequestKind[] }> = [
	{ path: "/ppr", kinds: ALL_KINDS },
	{ path: "/deep-shell/one", kinds: ALL_KINDS },
	{ path: "/runtime-prefetch/one", kinds: WITH_CACHED_SHELL },
	{ path: "/large-shell/one", kinds: WITH_CACHED_SHELL },
];

type Fetched = { status: number; body: string };

async function fetchFrom(request: APIRequestContext, url: string, kind: RequestKind): Promise<Fetched> {
	const response = await request.get(url, { headers: { ...REQUESTS[kind], "x-session": "parity" } });
	return { status: response.status(), body: await response.text() };
}

const tokenize = (text: string) => text.split(/([^A-Za-z0-9_-]+)/);

/**
 * Describes the first difference between the worker and Node.js, if any.
 *
 * A token is ignored when two Node.js responses disagree on it. The comparison then needs no list of
 * the values that Next.js and React generate on every render.
 */
function describeDifference(node: Fetched, nodeAgain: Fetched, worker: Fetched): string | undefined {
	if (worker.status !== node.status) {
		return `status ${worker.status} instead of ${node.status}`;
	}

	const [expected, expectedAgain, actual] = [node, nodeAgain, worker].map(({ body }) => tokenize(body));
	if (expected.length !== expectedAgain.length) {
		return "Node.js returned two responses with a different shape, so the route cannot be compared";
	}
	if (actual.length !== expected.length) {
		return `${worker.body.length} bytes instead of ${node.body.length}`;
	}

	const index = expected.findIndex((token, i) => token === expectedAgain[i] && token !== actual[i]);
	if (index === -1) {
		return undefined;
	}

	const context = (tokens: string[]) => tokens.slice(Math.max(0, index - 8), index + 8).join("");
	return `expected ${JSON.stringify(context(expected))} but received ${JSON.stringify(context(actual))}`;
}

test.describe("Cache Components responses match Node.js", () => {
	for (const { path, kinds } of ROUTES) {
		for (const kind of kinds) {
			test(`${kind} of ${path}`, async ({ request, baseURL }) => {
				// Both servers fill their caches on the first request.
				await Promise.all([
					fetchFrom(request, NODE_URL + path, kind),
					fetchFrom(request, baseURL + path, kind),
				]);

				const node = await fetchFrom(request, NODE_URL + path, kind);
				const worker = await fetchFrom(request, baseURL + path, kind);
				const nodeAgain = await fetchFrom(request, NODE_URL + path, kind);

				expect(describeDifference(node, nodeAgain, worker)).toBeUndefined();
			});
		}
	}
});
