import { AsyncLocalStorage } from "node:async_hooks";

import type { CloudflareContext } from "../../api";
// @ts-expect-error: resolved by wrangler build
import { handler as middlewareHandler } from "./middleware/handler.mjs";
// @ts-expect-error: resolved by wrangler build
import { handler as serverHandler } from "./server-functions/default/handler.mjs";

const cloudflareContextALS = new AsyncLocalStorage<CloudflareContext>();

// Note: this symbol needs to be kept in sync with the one defined in `src/api/get-cloudflare-context.ts`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any)[Symbol.for("__cloudflare-context__")] = new Proxy(
  {},
  {
    ownKeys: () => Reflect.ownKeys(cloudflareContextALS.getStore()!),
    getOwnPropertyDescriptor: (_, ...args) =>
      Reflect.getOwnPropertyDescriptor(cloudflareContextALS.getStore()!, ...args),
    get: (_, property) => Reflect.get(cloudflareContextALS.getStore()!, property),
    set: (_, property, value) => Reflect.set(cloudflareContextALS.getStore()!, property, value),
  }
);

export default {
  async fetch(request, env, ctx) {
    return cloudflareContextALS.run({ env, ctx, cf: request.cf }, async () => {
      const url = new URL(request.url);

      if (process.env.__PROCESS_ENV_POPULATED !== "1") {
        await populateProcessEnv(url, env.NEXTJS_ENV);
        process.env.__PROCESS_ENV_POPULATED = "1";
      }

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
async function populateProcessEnv(url: URL, nextJsEnv?: string) {
  // @ts-expect-error: resolved by wrangler build
  const nextEnvVars = await import("./.env.mjs");

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
