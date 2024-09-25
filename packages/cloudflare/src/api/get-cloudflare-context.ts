import "server-only";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface CloudflareEnv {}
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
  cf: CfProperties;
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
 * Throws an error if the context could not be retrieved
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
    // Note: we need to add the webpackIgnore comment to the dynamic import because
    // the next dev server transpiled modules on the fly but we don't want it to try
    // to also transpile the wrangler code
    const { getPlatformProxy } = await import(/* webpackIgnore: true */ "wrangler");
    const { env, cf, ctx } = await getPlatformProxy();
    global[cloudflareContextInNextDevSymbol] = {
      env,
      cf: cf as unknown as CfProperties,
      ctx: ctx as Context,
    };
  }

  return global[cloudflareContextInNextDevSymbol]!;
}
