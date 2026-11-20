import { setTimeout as wait } from "node:timers/promises";
import { Suspense } from "react";

type PageProps = {
	params: Promise<{ slug: string }>;
};

export const unstable_instant = {
	prefetch: "runtime",
	samples: [{ params: { slug: "sample" } }],
	unstable_disableBuildValidation: true,
};

let renders = 0;

// I/O that Next.js does not track, like a query to a database or a call to a binding. It completes
// while the static stages of the render are still running.
async function UncachedData() {
	await wait(0);

	return <p data-testid="uncached">Uncached render {++renders}</p>;
}

async function Slug({ params }: PageProps) {
	const { slug } = await params;

	return <p data-testid="uncached-slug">Uncached slug: {slug}</p>;
}

export default function UncachedIoPage({ params }: PageProps) {
	return (
		<main>
			<h1>Uncached I/O</h1>
			<Suspense fallback={<p>Loading slug...</p>}>
				<Slug params={params} />
			</Suspense>
			<Suspense fallback={<p data-testid="uncached-fallback">Loading uncached data...</p>}>
				<UncachedData />
			</Suspense>
		</main>
	);
}
