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
   * object containing the worker's bindings ([docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/))
   */
  env: CloudflareEnv;
  /**
   * object containing information regarding the current request ([docs](https://developers.cloudflare.com/workers/runtime-apis/request/#the-cf-property-requestinitcfproperties))
   */
  cf: CfProperties;
  /**
   * the current execution context object ([docs](https://developers.cloudflare.com/workers/runtime-apis/context))
   */
  ctx: Context;
};

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
  const cloudflareContext = (
    globalThis as unknown as {
      [cloudflareContextSymbol]: CloudflareContext<CfProperties, Context> | undefined;
    }
  )[cloudflareContextSymbol];

  if (!cloudflareContext) {
    // TODO: cloudflareContext should always be present in production/preview, if not it means that this
    //       is running under `next dev`, in this case use `getPlatformProxy` to return local proxies
    throw new Error("Cloudflare context is not defined!");
  }

  return cloudflareContext;
}
