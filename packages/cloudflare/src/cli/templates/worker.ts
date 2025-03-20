import { AsyncLocalStorage } from "node:async_hooks";

import type { CloudflareContext } from "../../api";
// @ts-expect-error: resolved by wrangler build
import * as nextEnvVars from "./env/next-env.mjs";
// @ts-expect-error: resolved by wrangler build
import { handler as middlewareHandler } from "./middleware/handler.mjs";
// @ts-expect-error: resolved by wrangler build
import { handler as serverHandler } from "./server-functions/default/handler.mjs";

const cloudflareContextALS = new AsyncLocalStorage<CloudflareContext>();

// Note: this symbol needs to be kept in sync with `src/api/get-cloudflare-context.ts`
Object.defineProperty(globalThis, Symbol.for("__cloudflare-context__"), {
  get() {
    return cloudflareContextALS.getStore();
  },
});

//@ts-expect-error: Will be resolved by wrangler build
export { DurableObjectQueueHandler } from "./.build/durable-objects/queue.js";
//@ts-expect-error: Will be resolved by wrangler build
export { DOShardedTagCache } from "./.build/durable-objects/sharded-tag-cache.js";

// Populate process.env on the first request
let processEnvPopulated = false;

export default {
  async fetch(request, env, ctx) {
    return cloudflareContextALS.run({ env, ctx, cf: request.cf }, async () => {
      const url = new URL(request.url);

      populateProcessEnv(url, env.NEXTJS_ENV);

      if (url.pathname === "/_next/image") {
        const imageUrl = url.searchParams.get("url") ?? "";
        return imageUrl.startsWith("/")
          ? env.ASSETS.fetch(new URL(imageUrl, request.url))
          : fetch(imageUrl, { cf: { cacheEverything: true } });
      }

      // The Middleware handler can return either a `Response` or a `Request`:
      // - `Response`s should be returned early
      // - `Request`s are handled by the Next server
      const reqOrResp = await middlewareHandler(request, env, ctx);

      if (reqOrResp instanceof Response) {
        return reqOrResp;
      }

      return serverHandler(reqOrResp, env, ctx);
    });
  },
} as ExportedHandler<{ ASSETS: Fetcher; NEXTJS_ENV?: string }>;

/**
 * Populate process.env with:
 * - the variables from Next .env* files
 * - the origin resolver information
 *
 * Note that cloudflare env string values are copied by the middleware handler.
 */
function populateProcessEnv(url: URL, nextJsEnv?: string) {
  if (processEnvPopulated) {
    return;
  }
  processEnvPopulated = true;
  const mode = nextJsEnv ?? "production";

  if (nextEnvVars[mode]) {
    for (const key in nextEnvVars[mode]) {
      process.env[key] = nextEnvVars[mode][key];
    }
  }

  // Set the default Origin for the origin resolver.
  process.env.OPEN_NEXT_ORIGIN = JSON.stringify({
    default: {
      host: url.hostname,
      protocol: url.protocol.slice(0, -1),
      port: url.port,
    },
  });
}
