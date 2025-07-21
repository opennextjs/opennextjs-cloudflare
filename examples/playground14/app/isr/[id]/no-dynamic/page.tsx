import { getPost } from "../../../../lib/posts";

// Imported from https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration
interface Post {
	id: string;
	title: string;
	content: string;
}

// Next.js will invalidate the cache when a
// request comes in, at most once every 1 hour.
export const revalidate = 3600;

// We'll prerender only the params from `generateStaticParams` at build time.
// If a request comes in for a path that hasn't been generated, it will 404.
export const dynamicParams = false;

export async function generateStaticParams() {
	return [{ id: "1" }, { id: "2" }, { id: "3" }];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const id = (await params).id;
	const post: Post = await getPost({ id }).then((res) => res.json());
	return (
		<main>
			<h1>{post.title}</h1>
			<p>{post.content}</p>
		</main>
	);
}
