import { ExternalHead } from "@example/external-head";
import type { InferGetServerSidePropsType } from "next";

export async function getServerSideProps() {
	return {
		props: {
			time: new Date().toISOString(),
		},
	};
}

// `<Head>` is rendered by a dependency that Next.js keeps external (like `next-seo`).
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1389
export default function Page({ time }: InferGetServerSidePropsType<typeof getServerSideProps>) {
	return (
		<div>
			<ExternalHead
				title="OpenNext external head"
				description="Head tags rendered by a node_modules dependency"
			/>
			<p>Rendered at {time}</p>
		</div>
	);
}
