import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";

import type { CloudflareContext } from "../../api";
// @ts-expect-error: resolved by wrangler build
import * as nextEnvVars from "./env/next-env.mjs";

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

      populateProcessEnv(url, env);

      // Serve images in development.
      // Note: "/cdn-cgi/image/..." requests do not reach production workers.
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

      // Fallback for the Next default image loader.
      if (url.pathname === "/_next/image") {
        const imageUrl = url.searchParams.get("url") ?? "";
        return imageUrl.startsWith("/")
          ? env.ASSETS?.fetch(new URL(imageUrl, request.url))
          : fetch(imageUrl, { cf: { cacheEverything: true } });
      }

      // @ts-expect-error: resolved by wrangler build
      const { handler } = await import("./server-functions/default/handler.mjs");

      return handler(request, env, ctx);
    });
  },
} as ExportedHandler<CloudflareEnv>;

/**
 * Populate process.env with:
 * - the environment variables and secrets from the cloudflare platform
 * - the variables from Next .env* files
 * - the origin resolver information
 */
function populateProcessEnv(url: URL, env: CloudflareEnv) {
  if (processEnvPopulated) {
    return;
  }

  // Some packages rely on `process.version` and `process.versions.node` (i.e. Jose@4)
  // TODO: Remove when https://github.com/unjs/unenv/pull/493 is merged
  Object.assign(process, { version: process.version || "v22.14.0" });
  // @ts-expect-error Node type does not match workerd
  Object.assign(process.versions, { node: "22.14.0", ...process.versions });

  processEnvPopulated = true;

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      process.env[key] = value;
    }
  }

  const mode = env.NEXTJS_ENV ?? "production";
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
