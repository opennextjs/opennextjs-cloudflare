import { NextResponse } from "next/server";

// The protection relies on the matcher only: every matched request is rejected.
export function middleware() {
	return new NextResponse("Authentication required", { status: 401 });
}

export const config = { matcher: ["/secret/admin/:path*"] };
