import type { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";

/**
 * Leaves rewrite targets for blocking runtime generation.
 *
 * @returns An empty path list with blocking fallback enabled.
 */
export const getStaticPaths: GetStaticPaths = () => {
	return {
		paths: [],
		fallback: "blocking",
	};
};

/**
 * Generates the middleware rewrite target.
 *
 * @param context Static generation context containing the rewritten slug.
 * @returns Props describing the rewritten route.
 */
export const getStaticProps: GetStaticProps = async (context) => {
	const slug = (context.params?.slug as string[] | undefined) ?? [];
	return {
		props: {
			slug,
			renderedAt: new Date().toISOString(),
		},
	};
};

/**
 * Renders the dynamic middleware rewrite target.
 *
 * @param props Generated slug and render timestamp.
 * @returns The rewritten page.
 */
export default function RewriteCodePath({
	slug,
	renderedAt,
}: InferGetStaticPropsType<typeof getStaticProps>) {
	return (
		<>
			<h1>Rewrite Code Path</h1>
			<div>Slug: {slug.join("/") || "(empty)"}</div>
			<div>Rendered at: {renderedAt}</div>
		</>
	);
}
