import { headers } from "next/headers";
import { setTimeout } from "node:timers/promises";
import { Suspense } from "react";

type PageProps = {
	params: Promise<{ slug: string }>;
};

/**
 * A dynamic import inside a Cache Components render makes Next.js track module loading, which is the
 * state that used to be shared by every request in a Worker isolate.
 */
async function TrackedImport({ params }: PageProps) {
	const [{ slug }] = await Promise.all([params, headers()]);
	const { describeSlug } = await import("@/lib/late-module");
	await setTimeout(50);

	return <p data-testid="tracked-import">{describeSlug(slug)}</p>;
}

export default function TrackedImportPage({ params }: PageProps) {
	return (
		<main>
			<p data-testid="tracked-import-shell">Tracked import shell</p>
			<Suspense fallback={<p data-testid="tracked-import-fallback">Loading tracked import...</p>}>
				<TrackedImport params={params} />
			</Suspense>
		</main>
	);
}
