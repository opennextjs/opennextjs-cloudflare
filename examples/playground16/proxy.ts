// `proxy.ts` replaces `middleware.ts` in Next.js 16 and always runs on the Node.js runtime.
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/617

import crypto from "node:crypto";
import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import { createElement } from "react";

/**
 * Routes requests through the Node.js proxy test cases.
 *
 * @param request The incoming Next.js request.
 * @returns A response or a continuation carrying test headers.
 */
export default function proxy(request: NextRequest) {
	// Keep OG usage in the proxy only so e2e tests can detect leakage into the server bundle.
	if (request.nextUrl.pathname === "/middleware-og") {
		return new ImageResponse(createElement("div", { style: { fontSize: 32 } }, "Middleware OG"), {
			width: 400,
			height: 100,
		});
	}
	if (request.nextUrl.pathname === "/api/hello") {
		return NextResponse.json({
			name: "World",
		});
	}
	if (request.nextUrl.pathname === "/redirect") {
		return NextResponse.redirect(new URL("/", request.url));
	}
	if (request.nextUrl.pathname === "/rewrite") {
		return NextResponse.rewrite(new URL("/", request.url));
	}

	return NextResponse.next({
		headers: {
			"x-middleware-test": "1",
			"x-random-node": crypto.randomUUID(),
		},
	});
}
