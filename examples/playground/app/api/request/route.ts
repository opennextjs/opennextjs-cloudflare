import { NextRequest } from "next/server";

export const GET = (request: NextRequest) => {
  return new Response(JSON.stringify({ nextUrl: request.nextUrl.href, url: request.url }));
};
