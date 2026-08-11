export async function GET(request: Request) {
	return Response.json({
		kept: request.headers.get("x-keep-me"),
		removed: request.headers.get("x-remove-me"),
	});
}
