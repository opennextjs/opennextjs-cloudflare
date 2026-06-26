import { expect, test } from "@playwright/test";

// See https://github.com/opennextjs/opennextjs-cloudflare/issues/617
test.describe("Node Middleware", () => {
	test("Node middleware should add headers", async ({ request }) => {
		const resp = await request.get("/");
		expect(resp.status()).toEqual(200);
		const headers = resp.headers();
		expect(headers["x-middleware-test"]).toEqual("1");
		expect(headers["x-random-node"]).toBeDefined();
	});

	test("Node middleware should return json", async ({ request }) => {
		const resp = await request.get("/api/hello");
		expect(resp.status()).toEqual(200);
		const json = await resp.json();
		expect(json).toEqual({ name: "World" });
	});

	test("Node middleware should redirect", async ({ request }) => {
		const resp = await request.get("/redirect", { maxRedirects: 0 });
		expect(resp.status()).toEqual(307);
		expect(resp.headers()["location"]).toEqual("/");
	});

	test("Node middleware should rewrite", async ({ request }) => {
		const resp = await request.get("/rewrite");
		expect(resp.status()).toEqual(200);
		expect(await resp.text()).toContain("Incremental PPR");
	});

	test("Node middleware should pass request header overrides", async ({ request }) => {
		const resp = await request.get("/header-override");
		expect(resp.status()).toEqual(200);
		expect(await resp.json()).toEqual({ fromProxy: "override" });
	});

	test("Node middleware should remove request headers omitted from override headers", async ({ request }) => {
		const resp = await request.get("/header-remove", {
			headers: {
				"x-remove-me": "remove me",
			},
		});
		expect(resp.status()).toEqual(200);
		expect(await resp.json()).toEqual({
			kept: "from-proxy",
			removed: null,
		});
	});

	test("Node middleware should preserve request bodies after proxy reads them", async ({ request }) => {
		const resp = await request.post("/body-pass", {
			data: "request body",
			headers: {
				"content-type": "text/plain",
			},
		});
		expect(resp.status()).toEqual(200);
		expect(await resp.json()).toEqual({
			body: "request body",
			seenByProxy: "request body",
		});
	});

	test("Node middleware should read and set cookies", async ({ request }) => {
		const resp = await request.get("/cookies", {
			headers: {
				cookie: "proxy-in=request-cookie",
			},
		});
		expect(resp.status()).toEqual(200);
		expect(await resp.json()).toEqual({ seen: "request-cookie" });
		expect(resp.headers()["set-cookie"]).toContain("proxy-out=ok");
	});

	test("Node middleware should return direct responses", async ({ request }) => {
		const resp = await request.get("/direct-response");
		expect(resp.status()).toEqual(200);
		expect(resp.headers()["x-direct-response"]).toEqual("1");
		expect(await resp.text()).toEqual("direct from proxy");
	});

	test.describe("matcher has predicates", () => {
		test("header predicates require a matching header value", async ({ request }) => {
			const withoutHeader = await request.get("/matcher/has-header");
			expect(withoutHeader.status()).toEqual(200);
			expect(await withoutHeader.json()).toMatchObject({ kind: "has-header", proxied: false });

			const wrongHeader = await request.get("/matcher/has-header", {
				headers: {
					"x-proxy-header": "skip",
				},
			});
			expect(wrongHeader.status()).toEqual(200);
			expect(await wrongHeader.json()).toMatchObject({ kind: "has-header", proxied: false });

			const matchingHeader = await request.get("/matcher/has-header", {
				headers: {
					"x-proxy-header": "run",
				},
			});
			expect(matchingHeader.status()).toEqual(200);
			expect(await matchingHeader.json()).toEqual({
				pathname: "/matcher/has-header",
				proxied: true,
			});
		});

		test("cookie predicates require a matching cookie value", async ({ request }) => {
			const withoutCookie = await request.get("/matcher/has-cookie");
			expect(withoutCookie.status()).toEqual(200);
			expect(await withoutCookie.json()).toMatchObject({ kind: "has-cookie", proxied: false });

			const wrongCookie = await request.get("/matcher/has-cookie", {
				headers: {
					cookie: "proxy-cookie=skip",
				},
			});
			expect(wrongCookie.status()).toEqual(200);
			expect(await wrongCookie.json()).toMatchObject({ kind: "has-cookie", proxied: false });

			const matchingCookie = await request.get("/matcher/has-cookie", {
				headers: {
					cookie: "proxy-cookie=run",
				},
			});
			expect(matchingCookie.status()).toEqual(200);
			expect(await matchingCookie.json()).toEqual({
				pathname: "/matcher/has-cookie",
				proxied: true,
			});

			const duplicateCookie = await request.get("/matcher/has-cookie", {
				headers: {
					cookie: "proxy-cookie=run; proxy-cookie=skip",
				},
			});
			expect(duplicateCookie.status()).toEqual(200);
			expect(await duplicateCookie.json()).toEqual({
				pathname: "/matcher/has-cookie",
				proxied: true,
			});

			const quotedCookie = await request.get("/matcher/has-cookie", {
				headers: {
					cookie: 'proxy-cookie="run"',
				},
			});
			expect(quotedCookie.status()).toEqual(200);
			expect(await quotedCookie.json()).toEqual({
				pathname: "/matcher/has-cookie",
				proxied: true,
			});
		});

		test("query predicates require a matching query value", async ({ request }) => {
			const withoutQuery = await request.get("/matcher/has-query");
			expect(withoutQuery.status()).toEqual(200);
			expect(await withoutQuery.json()).toMatchObject({ kind: "has-query", proxied: false });

			const wrongQuery = await request.get("/matcher/has-query?proxy=skip");
			expect(wrongQuery.status()).toEqual(200);
			expect(await wrongQuery.json()).toMatchObject({ kind: "has-query", proxied: false });

			const matchingQuery = await request.get("/matcher/has-query?proxy=run");
			expect(matchingQuery.status()).toEqual(200);
			expect(await matchingQuery.json()).toEqual({
				pathname: "/matcher/has-query",
				proxied: true,
			});
		});

		test("host predicates match the host without the port", async ({ request }) => {
			const resp = await request.get("/matcher/has-host");
			expect(resp.status()).toEqual(200);
			expect(await resp.json()).toEqual({
				pathname: "/matcher/has-host",
				proxied: true,
			});
		});
	});

	test.describe("matcher missing predicates", () => {
		test("header predicates run only when the header is missing", async ({ request }) => {
			const withoutHeader = await request.get("/matcher/missing-header");
			expect(withoutHeader.status()).toEqual(200);
			expect(await withoutHeader.json()).toEqual({
				pathname: "/matcher/missing-header",
				proxied: true,
			});

			const withHeader = await request.get("/matcher/missing-header", {
				headers: {
					"x-skip-proxy": "1",
				},
			});
			expect(withHeader.status()).toEqual(200);
			expect(await withHeader.json()).toMatchObject({ kind: "missing-header", proxied: false });
		});

		test("cookie predicates run only when the cookie is missing", async ({ request }) => {
			const withoutCookie = await request.get("/matcher/missing-cookie");
			expect(withoutCookie.status()).toEqual(200);
			expect(await withoutCookie.json()).toEqual({
				pathname: "/matcher/missing-cookie",
				proxied: true,
			});

			const withCookie = await request.get("/matcher/missing-cookie", {
				headers: {
					cookie: "skip-proxy=1",
				},
			});
			expect(withCookie.status()).toEqual(200);
			expect(await withCookie.json()).toMatchObject({ kind: "missing-cookie", proxied: false });
		});

		test("query predicates run only when the query is missing", async ({ request }) => {
			const withoutQuery = await request.get("/matcher/missing-query");
			expect(withoutQuery.status()).toEqual(200);
			expect(await withoutQuery.json()).toEqual({
				pathname: "/matcher/missing-query",
				proxied: true,
			});

			const withQuery = await request.get("/matcher/missing-query?skip-proxy=1");
			expect(withQuery.status()).toEqual(200);
			expect(await withQuery.json()).toMatchObject({ kind: "missing-query", proxied: false });
		});
	});
});
