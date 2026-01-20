import { revalidateTag } from "next/cache";

export function GET() {
	revalidateTag("fullyTagged", "max");
	return new Response("DONE");
}
