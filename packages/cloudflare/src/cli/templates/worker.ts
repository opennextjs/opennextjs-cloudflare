import { runWithCloudflareRequestContext } from "./cloudflare/init.js";
import { ChatAgent } from "vercel/ai-chat";

export { DOQueueHandler } from "./.build/durable-objects/queue.js";
export { DOShardedTagCache } from "./.build/durable-objects/sharded-tag-cache.js";

const agent = new ChatAgent({
  tools: [
    // Add your tools here
  ],
  vectorization: {
    // Add your vectorization configuration here
  },
  durableChat: {
    // Add your durable chat configuration here
  },
  kv: {
    // Add your KV configuration here
  },
  r2: {
    // Add your R2 configuration here
  },
  d1: {
    // Add your D1 configuration here
  }
});

export default {
  async fetch(request, env, ctx) {
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      const url = new URL(request.url);

      if (url.pathname === "/api/chat") {
        const apiKey = request.headers.get("api-key");

        if (apiKey !== env.VERCEL_AI_CHAT_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const { message } = await request.json();

        if (!message) {
          return new Response(JSON.stringify({ error: "Message is required" }), { status: 400 });
        }

        const response = await agent.sendMessage(message);

        return new Response(JSON.stringify({ response }), { status: 200 });
      }

      if (url.pathname === "/openapi.json") {
        return new Response(JSON.stringify({ /* OpenAPI spec content here */ }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/docs") {
        const readmeContent = await env.ASSETS.fetch(new URL("/README.md", url));
        return new Response(readmeContent.body, {
          headers: { "Content-Type": "text/markdown" },
        });
      }

      if (url.pathname.startsWith("/cdn-cgi/image/")) {
        const m = url.pathname.match(/\/cdn-cgi\/image\/.+?\/(?<url>.+)$/);
        if (m === null) {
          return new Response("Not Found!", { status: 404 });
        }
        const imageUrl = m.groups!.url!;
        return imageUrl.match(/^https?:\/\//)
          ? fetch(imageUrl, { cf: { cacheEverything: true } })
          : env.ASSETS?.fetch(new URL(`/${imageUrl}`, url));
      }

      if (url.pathname === `${globalThis.__NEXT_BASE_PATH__}/_next/image`) {
        const imageUrl = url.searchParams.get("url") ?? "";
        return imageUrl.startsWith("/")
          ? env.ASSETS?.fetch(`http://assets.local${imageUrl}`)
          : fetch(imageUrl, { cf: { cacheEverything: true } });
      }

      const { handler } = await import("./server-functions/default/handler.mjs");

      return handler(request, env, ctx);
    });
  },
} satisfies ExportedHandler<CloudflareEnv>;
