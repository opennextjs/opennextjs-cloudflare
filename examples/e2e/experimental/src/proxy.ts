import { type NextRequest, NextResponse } from "next/server";

export default async function proxy(request: NextRequest) {
	if (request.nextUrl.pathname.startsWith("/matcher/")) {
		return NextResponse.json({
			proxied: true,
			pathname: request.nextUrl.pathname,
		});
	}
	if (request.nextUrl.pathname === "/api/hello") {
		return NextResponse.json({
			name: "World",
		});
	}
	if (request.nextUrl.pathname === "/cookies") {
		const response = NextResponse.json({
			seen: request.cookies.get("proxy-in")?.value ?? null,
		});
		response.cookies.set("proxy-out", "ok");
		return response;
	}
	if (request.nextUrl.pathname === "/direct-response") {
		return new Response("direct from proxy", {
			headers: {
				"x-direct-response": "1",
			},
		});
	}
	if (request.nextUrl.pathname === "/redirect") {
		return NextResponse.redirect(new URL("/", request.url));
	}
	if (request.nextUrl.pathname === "/rewrite") {
		return NextResponse.rewrite(new URL("/", request.url));
	}
	if (request.nextUrl.pathname === "/header-override") {
		const headers = new Headers(request.headers);
		headers.set("x-from-proxy", "override");
		return NextResponse.next({
			request: {
				headers,
			},
		});
	}
	if (request.nextUrl.pathname === "/header-remove") {
		const headers = new Headers(request.headers);
		headers.delete("x-remove-me");
		headers.set("x-keep-me", "from-proxy");
		return NextResponse.next({
			request: {
				headers,
			},
		});
	}
	if (request.nextUrl.pathname === "/body-pass") {
		const body = await request.text();
		const headers = new Headers(request.headers);
		headers.set("x-body-seen-by-proxy", body);
		return NextResponse.next({
			request: {
				headers,
			},
		});
	}

	return NextResponse.next({
		headers: {
			"x-middleware-test": "1",
			"x-random-node": crypto.randomUUID(),
		},
	});
}

export const config = {
	matcher: [
		"/",
		"/api/hello",
		"/cookies",
		"/direct-response",
		"/body-pass",
		"/header-remove",
		"/header-override",
		"/redirect",
		"/rewrite",
		{
			source: "/matcher/has-header",
			has: [
				{
					type: "header",
					key: "x-proxy-header",
					value: "run",
				},
			],
		},
		{
			source: "/matcher/has-cookie",
			has: [
				{
					type: "cookie",
					key: "proxy-cookie",
					value: "run",
				},
			],
		},
		{
			source: "/matcher/has-query",
			has: [
				{
					type: "query",
					key: "proxy",
					value: "run",
				},
			],
		},
		{
			source: "/matcher/has-host",
			has: [
				{
					type: "host",
					value: "localhost",
				},
			],
		},
		{
			source: "/matcher/missing-header",
			missing: [
				{
					type: "header",
					key: "x-skip-proxy",
				},
			],
		},
		{
			source: "/matcher/missing-cookie",
			missing: [
				{
					type: "cookie",
					key: "skip-proxy",
				},
			],
		},
		{
			source: "/matcher/missing-query",
			missing: [
				{
					type: "query",
					key: "skip-proxy",
				},
			],
		},
	],
};
