// Use headers to force a dynamic response
import { headers } from "next/headers";

export async function GET() {
  const nextConfig = process.env.__NEXT_PRIVATE_STANDALONE_CONFIG
    ? JSON.parse(process.env.__NEXT_PRIVATE_STANDALONE_CONFIG)
    : undefined;
  return Response.json({ nextConfig, headers: headers() });
}
