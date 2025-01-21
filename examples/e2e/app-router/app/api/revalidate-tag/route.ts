import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  revalidateTag("revalidate");

  return new Response("ok");
}
