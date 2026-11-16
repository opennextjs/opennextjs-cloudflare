/**
 * Returns the client-reference-manifest regression route response.
 *
 * The route directory must not be treated as a client reference manifest during the OpenNext build.
 *
 * @returns A response identifying the route.
 */
export function GET() {
	return Response.json({ route: "/index_client-reference-manifest.js" });
}
