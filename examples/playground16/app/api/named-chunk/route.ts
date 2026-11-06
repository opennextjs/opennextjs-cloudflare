export const dynamic = "force-dynamic";

// `webpackChunkName` makes webpack emit the server chunk as `chunks/named-chunk.js` instead of `chunks/<id>.js`.
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1326
export async function GET() {
	const { message } = await import(/* webpackChunkName: "named-chunk" */ "./message");
	return Response.json({ message });
}
