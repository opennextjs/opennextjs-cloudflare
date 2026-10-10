import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";

export const dynamic = "force-dynamic";

/**
 * Reports which socket implementation `pg` selected.
 *
 * On workerd, `pg` loads its socket from `pg-cloudflare`, whose Workers implementation is only
 * exposed through the `workerd` export condition. Before the adapter copied that build into the
 * output, bundling the server failed with `Could not resolve "pg-cloudflare"`.
 *
 * No connection is opened: only the socket class is inspected, so no database is needed.
 */
export async function GET() {
	const connectionString = "postgresql://user:pass@example.invalid:5432/db";
	// Mirror the issue: the Prisma adapter is bundled by Next.js and loads `pg` from the trace.
	new PrismaPg({ connectionString });
	try {
		const client = new Client({ connectionString });
		// Typed as a Node.js `Duplex`, but `pg-cloudflare` provides a `CloudflareSocket` on workerd.
		const { stream } = client.connection;
		return Response.json({
			stream: stream.constructor.name,
			// `startTls` only exists on `CloudflareSocket`.
			startTls: "startTls" in stream && typeof stream.startTls === "function",
		});
	} catch (e) {
		return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
