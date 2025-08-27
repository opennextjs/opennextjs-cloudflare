import SSE from "./_components/sse";

export const dynamic = "force-static";

export default function Page() {
	const date = new Date().toISOString();

	return (
		<main>
			<h1 data-testid="date">{date}</h1>

			<SSE />
		</main>
	);
}
