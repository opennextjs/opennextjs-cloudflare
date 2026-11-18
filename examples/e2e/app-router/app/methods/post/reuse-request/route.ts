import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
	const reused = new NextRequest(request.url, request);
	return Response.json({
		method: reused.method,
		contentType: reused.headers.get("content-type"),
		body: await reused.text(),
	});
}
