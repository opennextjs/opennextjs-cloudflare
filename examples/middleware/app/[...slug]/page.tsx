export function generateStaticParams() {
	return [{ slug: ["admin", "%ZZ"] }];
}

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
	const { slug } = await params;

	return <h1>Protected content: {slug.join("/")}</h1>;
}
