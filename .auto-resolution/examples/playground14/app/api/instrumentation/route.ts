import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
	return NextResponse.json({
		"nodejs-instrumentation-setup": globalThis["__NODEJS_INSTRUMENTATION_SETUP"],
		"edge-instrumentation-setup": globalThis["__EDGE_INSTRUMENTATION_SETUP"],
	});
}
