import dynamic from "next/dynamic";

// `webpackChunkName` makes webpack emit the server chunk as `chunks/named-chunk.js`
// instead of `chunks/<id>.js`.
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1326
const NamedChunk = dynamic(() => import(/* webpackChunkName: "named-chunk" */ "@/components/named-chunk"));

export async function getServerSideProps() {
	return { props: {} };
}

export default function Page() {
	return (
		<>
			<h1>Named chunk</h1>
			<NamedChunk />
		</>
	);
}
