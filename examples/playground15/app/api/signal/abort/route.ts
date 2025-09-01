import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	const stream = new ReadableStream({
		async start(controller) {
			request.signal.addEventListener("abort", async () => {
				/**
				 * I was not allowed to `revalidatePath` or `revalidateTag` here. I would run into this error from Next:
				 * Error: Invariant: static generation store missing in revalidatePath
				 *
				 * Affected line:
				 * https://github.com/vercel/next.js/blob/ea08bf27/packages/next/src/server/web/spec-extension/revalidate.ts#L89-L92
				 *
				 */
				const host = new URL(request.url).host;
				// We need to set the protocol to http, cause in `wrangler dev` it will be https
				await fetch(`http://${host}/api/signal/revalidate`);

				try {
					controller.close();
				} catch (_) {
					// Controller might already be closed, which is fine
					// This does only happen in `next start`
				}
			});

			let i = 0;
			while (!request.signal.aborted) {
				controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ number: i++ })}\n\n`));
				await new Promise((resolve) => setTimeout(resolve, 2_000));
			}
		},
	});

	return new NextResponse(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
