import type { InferGetStaticPropsType } from "next";
import Link from "next/link";

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
			<Link href="/">Home</Link>
		</div>
	);
}
