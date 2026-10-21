import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { getAppPort } from "../../../common/apps";

const NODE_PORT = getAppPort("experimental", { isWorker: false });
const NODE_URL = `http://localhost:${NODE_PORT}`;

// One worker runs the tests of this file in order, so they share the Node.js server.
test.describe.configure({ mode: "default" });

let nodeServer: ChildProcess;

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

// A route with `use cache` content in its shell differs from Node.js because `node:zlib` on workerd
// rejects the `maxOutputLength` that Next.js uses to read the postponed state, so the document and the
// route prefetch are not resumed.
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
