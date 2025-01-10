declare global {
  interface CloudflareEnv {
    NEXT_CACHE_WORKERS_KV?: KVNamespace;
    ASSETS?: Fetcher;
  }
}

export type CloudflareContext<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
> = {
  /**
   * the worker's [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
   */
  env: CloudflareEnv;
  /**
   * the request's [cf properties](https://developers.cloudflare.com/workers/runtime-apis/request/#the-cf-property-requestinitcfproperties)
   */
  cf: CfProperties | undefined;
  /**
   * the current [execution context](https://developers.cloudflare.com/workers/runtime-apis/context)
   */
  ctx: Context;
};

// Note: this symbol needs to be kept in sync with the one used in `src/cli/templates/worker.ts`
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

/**
 * Utility to get the current Cloudflare context
 *
 * @returns the cloudflare context
 */
export async function getCloudflareContext<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): Promise<CloudflareContext<CfProperties, Context>> {
  const global = globalThis as unknown as {
    [cloudflareContextSymbol]: CloudflareContext<CfProperties, Context> | undefined;
  };

  const cloudflareContext = global[cloudflareContextSymbol];

  if (!cloudflareContext) {
    // the cloudflare context is initialized by the worker and is always present in production/preview,
    // so, it not being present means that the application is running under `next dev`
    return getCloudflareContextInNextDev();
  }

  return cloudflareContext;
}

const cloudflareContextInNextDevSymbol = Symbol.for("__next-dev/cloudflare-context__");

/**
 * Gets a local proxy version of the cloudflare context (created using `getPlatformProxy`) when
 * running in the standard next dev server (via `next dev`)
 *
 * @returns the local proxy version of the cloudflare context
 */
async function getCloudflareContextInNextDev<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): Promise<CloudflareContext<CfProperties, Context>> {
  const global = globalThis as unknown as {
    [cloudflareContextInNextDevSymbol]: CloudflareContext<CfProperties, Context> | undefined;
  };

  if (!global[cloudflareContextInNextDevSymbol]) {
    // Note: we never want wrangler to be bundled in the Next.js app, that's why the import below looks like it does
    const { getPlatformProxy } = await import(
      /* webpackIgnore: true */ `${"__wrangler".replaceAll("_", "")}`
    );
    const { env, cf, ctx } = await getPlatformProxy({
      // This allows the selection of a wrangler environment while running in next dev mode
      environment: process.env.NEXT_DEV_WRANGLER_ENV,
    });
    global[cloudflareContextInNextDevSymbol] = {
      env,
      cf: cf as unknown as CfProperties,
      ctx: ctx as Context,
    };
  }

  return global[cloudflareContextInNextDevSymbol]!;
}
