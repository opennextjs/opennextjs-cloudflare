export async function POST(request: Request) {
	return Response.json({
		body: await request.text(),
		seenByProxy: request.headers.get("x-body-seen-by-proxy"),
	});
}
