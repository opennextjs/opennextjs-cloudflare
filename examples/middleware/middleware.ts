import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export function middleware(request: NextRequest, event: NextFetchEvent) {
	console.log("middleware");
	if (request.nextUrl.pathname.startsWith("/admin")) {
		return new NextResponse("Authentication required", { status: 401 });
	}
	if (request.nextUrl.pathname === "/encoded-m%69ddleware") {
		return new NextResponse("Middleware matched encoded path");
	}
	if (request.nextUrl.pathname === "/about") {
		return NextResponse.redirect(new URL("/redirected", request.url));
	}
	if (request.nextUrl.pathname === "/another") {
		return NextResponse.rewrite(new URL("/rewrite", request.url));
	}
	if (request.nextUrl.pathname === "/clerk") {
		return clerkMiddleware(async () => {}, {
			publishableKey: "pk_test_ZXhhbXBsZS5hY2NvdW50cy5kZXYk",
			secretKey: "skey",
		})(request, event);
	}

	const requestHeaders = new Headers(request.headers);
	const cloudflareContext = getCloudflareContext();

	requestHeaders.set(
		"x-cloudflare-context",
		`typeof \`cloudflareContext.env\` = ${typeof cloudflareContext.env}`
	);

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	matcher: [
		"/about/:path*",
		"/another/:path*",
		"/middleware/:path*",
		"/encoded-middleware",
		"/admin/:path*",
		"/clerk",
	],
};
