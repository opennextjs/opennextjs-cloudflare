import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.json({
    "nodejs-instrumentation-setup": globalThis["__NODEJS_INSTRUMENTATION_SETUP"] ?? "undefined",
    "edge-instrumentation-setup": globalThis["__EDGE_INSTRUMENTATION_SETUP"] ?? "undefined",
  });
}

export const config = {
  matcher: ["/middleware"],
};
