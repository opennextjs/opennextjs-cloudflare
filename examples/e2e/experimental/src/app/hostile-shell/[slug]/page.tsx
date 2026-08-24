import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { loadHostileChunk } from "./chunk-loader";
import { hostileYield } from "./timer-harness";

type PageProps = { params: Promise<{ slug: string }> };

export const unstable_instant = {
	prefetch: "runtime",
	samples: [{ params: { slug: "sample" }, headers: [["x-session", "sample"]] }],
	unstable_disableBuildValidation: true,
};

const LAST_BLOCK = 95;
const BLOCK_PAYLOAD = "hostile-cache-components-payload-".repeat(36);

async function getHostileBlock(index: number) {
	"use cache";

	const { chunkToken } = await loadHostileChunk(index);
	await hostileYield(index);
	return `${index}:${chunkToken}:${BLOCK_PAYLOAD}`;
}

async function HostileBlock({ index }: { index: number }) {
	for (let hop = 0; hop < index % 7; hop++) {
		await Promise.resolve();
	}

	const value = await getHostileBlock(index);
	return <p data-hostile-block={index}>{value}</p>;
}

async function RequestHole({ params }: PageProps) {
	const [{ slug }, requestHeaders] = await Promise.all([params, headers()]);
	await hostileYield(slug.length);

	return (
		<p data-testid="hostile-dynamic">
			Hostile dynamic: {slug}:{requestHeaders.get("x-session") ?? "none"}:{randomUUID()}
		</p>
	);
}

/**
 * A deliberately hostile Cache Components graph: a wide cached shell, cold split-chunk imports,
 * every immediate API an application can capture, varied microtask depth, and a request-only hole.
 * Truncation at any staged boundary loses a numbered block or the final sentinel.
 */
export default function HostileShellPage({ params }: PageProps) {
	return (
		<main>
			<p data-testid="hostile-shell">Hostile shell</p>
			<Link href="/hostile-shell/navigation-second">Hostile shell second item</Link>
			{Array.from({ length: LAST_BLOCK + 1 }, (_, index) => (
				<Suspense key={index} fallback={<p data-hostile-fallback={index}>Loading block {index}</p>}>
					<HostileBlock index={index} />
				</Suspense>
			))}
			<Suspense fallback={<p data-testid="hostile-dynamic-fallback">Loading hostile dynamic...</p>}>
				<RequestHole params={params} />
			</Suspense>
		</main>
	);
}
