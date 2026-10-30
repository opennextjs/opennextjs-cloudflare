import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

type PageProps = { params: Promise<{ slug: string }> };

export const unstable_instant = {
	prefetch: "runtime",
	samples: [{ params: { slug: "sample" }, headers: [["x-session", "sample"]] }],
	unstable_disableBuildValidation: true,
};

const BLOCK = "cache-components-large-shell-".repeat(48);

async function cachedBlock(index: number) {
	"use cache";
	await Promise.resolve();
	return `${index}:${BLOCK}`;
}

async function LargeBlock({ index }: { index: number }) {
	for (let i = 0; i < index % 5; i++) await Promise.resolve();
	const value = await cachedBlock(index);
	return <p data-large-block={index}>{value}</p>;
}

async function RequestContent({ params }: PageProps) {
	const [{ slug }, requestHeaders] = await Promise.all([params, headers()]);
	return (
		<p data-testid="large-dynamic">
			Large dynamic: {slug}:{requestHeaders.get("x-session") ?? "none"}:{randomUUID()}
		</p>
	);
}

export default function LargeShellPage({ params }: PageProps) {
	return (
		<main>
			<p data-testid="large-shell">Large shell</p>
			<Link href="/large-shell/navigation-second">Large shell second item</Link>
			{Array.from({ length: 64 }, (_, index) => (
				<LargeBlock key={index} index={index} />
			))}
			<Suspense fallback={<p data-testid="large-fallback">Loading large dynamic content...</p>}>
				<RequestContent params={params} />
			</Suspense>
		</main>
	);
}
