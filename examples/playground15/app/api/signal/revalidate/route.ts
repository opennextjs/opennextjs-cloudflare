import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET() {
	revalidatePath("/signal");

	return new Response("ok");
}
