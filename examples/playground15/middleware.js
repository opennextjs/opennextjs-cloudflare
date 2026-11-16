import { NextResponse } from "next/server";

export function middleware(request) {
	// Public files protected by the middleware (see `e2e/assets.cloudflare.spec.ts`)
	if (request.nextUrl.pathname.startsWith("/protected/")) {
		if (!request.cookies.has("session")) {
			return new NextResponse("Unauthorized", { status: 401 });
		}
		return NextResponse.next();
	}

	return NextResponse.json({
		"nodejs-instrumentation-setup": globalThis["__NODEJS_INSTRUMENTATION_SETUP"],
		"edge-instrumentation-setup": globalThis["__EDGE_INSTRUMENTATION_SETUP"],
	});
}

export const config = {
	matcher: [
		"/middleware-instrumentation",
		"/protected/handbook.html",
		"/protected/board-pack/index.html",
		"/protected/secret.html",
		"/protected/notes.htm.html",
	],
};
