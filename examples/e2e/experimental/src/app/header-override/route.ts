export function GET(request: Request) {
	return Response.json({
		fromProxy: request.headers.get("x-from-proxy"),
	});
}
