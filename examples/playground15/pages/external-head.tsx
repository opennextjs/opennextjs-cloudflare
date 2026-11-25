import { ExternalHead } from "external-head";

// `<Head>` rendered at request time by a dependency kept external (like `next-seo`).
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1389
export function getServerSideProps() {
	return { props: {} };
}

export default function Page() {
	return <ExternalHead title="External Head" description="Rendered by a dependency" />;
}
