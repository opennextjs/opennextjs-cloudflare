import { FullyCachedComponentWithTag } from "@/components/cached";
import { Suspense } from "react";

/**
 * Leaves test paths for runtime generation while satisfying Next.js 16.2 validation.
 *
 * @returns One unrelated prebuilt parameter.
 */
export function generateStaticParams(): Array<{ id: string }> {
	return [{ id: "prebuilt" }];
}

/**
 * Renders an on-demand page containing a tagged composable-cache entry.
 *
 * @param props Route parameters.
 * @returns The generated page and tagged cached component.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	return (
		<main>
			<p data-testid="on-demand-page">On-demand page: {id}</p>
			<Suspense fallback={<p>Loading...</p>}>
				<FullyCachedComponentWithTag />
			</Suspense>
		</main>
	);
}
