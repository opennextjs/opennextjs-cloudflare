import Head from "next/head";

export function getServerSideProps() {
	return {
		props: {
			time: new Date().toISOString(),
		},
	};
}
export default function Page({ time }) {
	return (
		<div>
			<Head>
				<title>SSR Head</title>
				<meta name="description" content="SSR" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<div className="flex" data-testid="time">
				Time: {time}
			</div>
		</div>
	);
}
