export function GET(
	request: Request,
	{
		params,
	}: {
		params: Promise<{ kind: string }>;
	}
) {
	return params.then(({ kind }) =>
		Response.json({
			kind,
			proxied: false,
			url: request.url,
		})
	);
}
