/**
 * Returns the manifest-glob regression route response.
 *
 * The route directory must not be treated as a JSON manifest during the OpenNext build.
 *
 * @returns A response identifying the route.
 */
export function GET() {
	return Response.json({ route: "/mail-manifest.json" });
}
