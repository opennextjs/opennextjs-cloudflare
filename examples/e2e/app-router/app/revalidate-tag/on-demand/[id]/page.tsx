export const dynamicParams = true;

/**
 * Leaves all on-demand paths for runtime generation.
 *
 * @returns An empty list of prebuilt parameters.
 */
export function generateStaticParams(): [] {
	return [];
}

/**
 * Renders an App Router page generated on demand.
 *
 * @param props Route parameters.
 * @returns The generated page marker.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	return <p data-testid="on-demand-page">On-demand page: {id}</p>;
}
