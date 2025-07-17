// This test relies on using `.dev.vars` to set the environment to `development`
// However `next build` is not passed an environment, so we do not want to cache
// the output.
export const dynamic = "force-dynamic";

export async function GET() {
	return new Response(JSON.stringify(process.env));
}
