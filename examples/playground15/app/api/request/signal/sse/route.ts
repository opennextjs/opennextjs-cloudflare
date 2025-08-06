import { NextRequest, NextResponse } from "next/server";

function sleep(time: number) {
	return new Promise(async (resolve) => {
		setTimeout(resolve, time);
	});
}

export async function GET(request: NextRequest) {
	console.log(globalThis[Symbol.for("__cloudflare-context__")].abortSignal === request.signal);
	const stream = new ReadableStream({
		async start(controller) {
			request.signal.addEventListener("abort", () => {
				console.log("====== abort ======");
				controller.close();
			});

			while (!request.signal.aborted) {
				console.log("===== enqueue =====");
				controller.enqueue(
					new TextEncoder().encode(`data: ${JSON.stringify({ number: Math.random() })}\n\n`)
				);
				await sleep(2 * 1000);
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
