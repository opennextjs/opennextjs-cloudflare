import { unstable_cache } from "next/cache";

// Tags the (statically generated) page with `regional`.
const getData = unstable_cache(async () => Date.now(), ["regional"], { tags: ["regional"] });

export default async function Page() {
	const data = await getData();
	return (
		<main>
			<p data-testid="rendered-at">{Date.now()}</p>
			<p data-testid="data">{data}</p>
		</main>
	);
}
