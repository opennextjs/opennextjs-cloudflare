// `/secret/admin` is protected by the middleware only.
export function generateStaticParams() {
	return [{ slug: ["admin"] }, { slug: ["public"] }];
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
	const { slug } = await params;
	return <p data-testid="slug">{slug.join("/")}</p>;
}
