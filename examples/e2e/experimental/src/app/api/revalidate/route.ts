import { revalidateTag } from "next/cache";

export function GET() {
	// Revalidate the tag with expire:0 to mark it for immediate revalidation; the next request should be a MISS
	revalidateTag("fullyTagged", { expire: 0 });
	return new Response("DONE");
}
