import { expect, test, type APIRequestContext } from "@playwright/test";

const ROUTE_PREFETCH = { rsc: "1", "next-router-prefetch": "1" };
const SEGMENT_PREFETCH = { ...ROUTE_PREFETCH, "next-router-segment-prefetch": "/_tree" };
const RUNTIME_PREFETCH = { rsc: "1", "next-router-prefetch": "2" };
const NAVIGATION = { rsc: "1", "next-url": "/" };

const PAYLOAD_CASES = [
	{ kind: "document", headers: {} },
	{ kind: "document", headers: {} },
	{ kind: "route", headers: ROUTE_PREFETCH },
	{ kind: "segment", headers: SEGMENT_PREFETCH },
	{ kind: "runtime", headers: RUNTIME_PREFETCH },
	{ kind: "navigation", headers: NAVIGATION },
] as const;

async function getBody(request: APIRequestContext, path: string, headers: Record<string, string> = {}) {
	const response = await request.get(path, { headers });
	return {
		status: response.status(),
		contentType: response.headers()["content-type"] ?? "",
		body: await response.body(),
	};
}

function expectCompleteShell(body: Buffer, where: string) {
	expect(body.byteLength, `${where} should include the wide shell`).toBeGreaterThan(100 * 1024);
	const text = body.toString("utf8");
	for (const index of [0, 47, 95]) {
		expect(text, `${where} lost block ${index}`).toMatch(
			new RegExp(`(?:"data-hostile-block":${index}|data-hostile-block="${index}")`)
		);
	}
	expect(text, `${where} returned a Flight error`).not.toMatch(/^\w+:E\{/m);
}

function expectCompleteSegment(body: Buffer, where: string) {
	const text = body.toString("utf8");
	expect(body.byteLength, `${where} carried only a close marker`).toBeGreaterThan(1);
	expect(text, `${where} lost its root model`).toContain("0:{");
	expect(text, `${where} lost its router tree`).toContain('"tree"');
	expect(text, `${where} lost its build id`).toContain('"buildId"');
	expect(text, `${where} returned a Flight error`).not.toMatch(/^\w+:E\{/m);
}

test.describe("hostile Cache Components graph", () => {
	test("cold and warm documents, prefetches, and navigation payloads complete", async ({ request }) => {
		const path = `/hostile-shell/cold-${Date.now()}`;

		for (const [index, { kind, headers }] of PAYLOAD_CASES.entries()) {
			const session = `hostile-${Date.now()}-${index}`;
			const result = await getBody(request, path, { ...headers, "x-session": session });
			const where = `${kind} ${path}`;

			expect(result.status, where).toEqual(200);
			if (kind === "segment") {
				expectCompleteSegment(result.body, where);
			} else {
				expectCompleteShell(result.body, where);
			}
			if (kind === "document") {
				const html = result.body.toString("utf8");
				expect(result.contentType).toContain("text/html");
				expect(html).toContain("</html>");
				expect(html).toContain("Hostile dynamic: ");
				expect(html).toContain(path.split("/").at(-1));
				expect(html).toContain(session);
			} else {
				expect(result.contentType).toContain("text/x-component");
			}
		}
	});

	test("same-route and cold-route runtime prefetches remain complete under overlap", async ({ request }) => {
		const repeated = Array.from({ length: 24 }, (_, index) =>
			getBody(request, "/hostile-shell/repeated", {
				...RUNTIME_PREFETCH,
				"x-session": `repeated-${index}`,
			})
		);
		const cold = Array.from({ length: 24 }, (_, index) =>
			getBody(request, `/hostile-shell/cold-${Date.now()}-${index}`, RUNTIME_PREFETCH)
		);

		const results = await Promise.all([...repeated, ...cold]);
		for (const [index, result] of results.entries()) {
			expect(result.status, `overlapping runtime prefetch ${index}`).toEqual(200);
			expect(result.contentType).toContain("text/x-component");
			expectCompleteShell(result.body, `overlapping runtime prefetch ${index}`);
		}
	});

	test("client navigation resolves the request hole without a document reload", async ({ page }) => {
		const session = `hostile-navigation-${Date.now()}`;
		await page.setExtraHTTPHeaders({ "x-session": session });
		await page.goto("/hostile-shell/navigation-first");

		await expect(page.getByTestId("hostile-dynamic")).toContainText(
			`Hostile dynamic: navigation-first:${session}:`
		);
		await expect(page.locator('[data-hostile-block="95"]:visible')).toBeVisible({ timeout: 15_000 });
		await page.getByRole("link", { name: "Hostile shell second item" }).click();
		await page.waitForURL("/hostile-shell/navigation-second");
		await expect(page.getByTestId("hostile-dynamic")).toContainText(
			`Hostile dynamic: navigation-second:${session}:`
		);
		await expect(page.locator('[data-hostile-block="95"]:visible')).toBeVisible({ timeout: 15_000 });
		expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toEqual(1);
	});
});
