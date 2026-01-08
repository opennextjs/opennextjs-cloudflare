import module from "node:module";

export const dynamic = "force-dynamic";

export async function GET() {
	if (globalThis.Cloudflare) {
		// Importing `cloudflare:*` does not work in dev (using `next dev`) because the Node runtime is used there.
		// Then you should avoid it to write portable code.
		// To access `env` and bindings, using `getCloudflareContext()` is the preferred way.
		// See https://opennext.js.org/cloudflare/bindings
		const req = module.createRequire("file:///");
		const { env } = req("cloudflare:workers");
		return Response.json({ cloudflare: true, env });
	}

	return Response.json({ cloudflare: false });
}
