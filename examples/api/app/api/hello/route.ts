import { headers } from "next/headers";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  const headersList = headers();

  const fromCloudflareContext = !!headersList.get("from-cloudflare-context");

  if (!fromCloudflareContext) {
    return new Response("Hello World!");
  }

  const { env } = await getCloudflareContext();
  return new Response(env.hello);
}

export async function POST(request: Request) {
  const text = await request.text();
  return new Response(`Hello post-World! body=${text}`);
}
