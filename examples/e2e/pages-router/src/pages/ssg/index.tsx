import type { InferGetStaticPropsType } from "next";

export async function getStaticProps() {
	return {
		props: {
			time: new Date().toISOString(),
		},
	};
}

export default function Page({ time }: InferGetStaticPropsType<typeof getStaticProps>) {
	return (
		<div>
			<div className="flex" data-testid="time">
				Time: {time}
			</div>
			<a href="/">Home</a>
		</div>
	);
}
