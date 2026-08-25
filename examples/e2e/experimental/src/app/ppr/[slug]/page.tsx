import { headers } from "next/headers";
import Link from "next/link";
import { setTimeout } from "node:timers/promises";
import { Suspense } from "react";

type PageProps = {
	params: Promise<{ slug: string }>;
};

async function DynamicSlug({ params }: PageProps) {
	const [{ slug }] = await Promise.all([params, headers()]);
	await setTimeout(100);

	return <p data-testid="dynamic-slug">Dynamic slug: {slug}</p>;
}

export default function DynamicPPRPage({ params }: PageProps) {
	return (
		<main>
			<p data-testid="static-shell">Static shell</p>
			<nav>
				<Link href="/ppr/first">First item</Link>
				<Link href="/ppr/second">Second item</Link>
			</nav>
			<Suspense fallback={<p data-testid="dynamic-fallback">Loading dynamic slug...</p>}>
				<DynamicSlug params={params} />
			</Suspense>
		</main>
	);
}
