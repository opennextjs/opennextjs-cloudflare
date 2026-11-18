import { NextResponse, type NextRequest } from "next/server";

// The protection relies on the matcher only: matched requests are rejected unless authorized.
export function middleware(request: NextRequest) {
	if (request.headers.get("authorization") === "Bearer e2e") {
		return NextResponse.next();
	}
	return new NextResponse("Authentication required", { status: 401 });
}

export const config = { matcher: ["/secret/admin/:path*"] };
