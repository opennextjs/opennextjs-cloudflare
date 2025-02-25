import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.json({
    "nodejs-instrumentation-setup": globalThis["__NODEJS_INSTRUMENTATION_SETUP"],
    "edge-instrumentation-setup": globalThis["__EDGE_INSTRUMENTATION_SETUP"],
  });
}

export const config = {
  matcher: ["/middleware-instrumentation"],
};
