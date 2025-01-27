import type { Context, RunningCodeOptions } from "node:vm";

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

/**
 * Symbol used as an index in the global scope to set and retrieve the Cloudflare context
 *
 * This is used both in production (in the actual built worker) and in development (`next dev`)
 *
 * Note: this symbol needs to be kept in sync with the one used in `src/cli/templates/worker.ts`
 */
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

/**
 * `globalThis` override for internal usage (simply the standard `globalThis`) enhanced with
 * a property indexed by the `cloudflareContextSymbol`
 */
type InternalGlobalThis<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
> = typeof globalThis & {
  [cloudflareContextSymbol]: CloudflareContext<CfProperties, Context> | undefined;
};

/**
 * Utility to get the current Cloudflare context
 *
 * @returns the cloudflare context
 */
export function getCloudflareContext<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): CloudflareContext<CfProperties, Context> {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;

  const cloudflareContext = global[cloudflareContextSymbol];

  if (!cloudflareContext) {
    // the cloudflare context is initialized by the worker and is always present in production/preview
    // during local development (`next dev`) it might be missing only if the developers hasn't called
    // the `initOpenNextCloudflareForDev` function in their Next.js config file
    const getContextFunctionName = getCloudflareContext.name;
    const initFunctionName = initOpenNextCloudflareForDev.name;
    throw new Error(
      `\n\n\`${getContextFunctionName}\` has been called during development without having called` +
        ` the \`${initFunctionName}\` function inside the Next.js config file.\n\n` +
        `In order to use \`${getContextFunctionName}\` import and call ${initFunctionName} in the Next.js config file.\n\n` +
        "Example: \n   ```\n   // next.config.mjs\n\n" +
        `   import { ${initFunctionName} } from "@opennextjs/cloudflare";\n\n` +
        `   ${initFunctionName}();\n\n` +
        "   /** @type {import('next').NextConfig} */\n" +
        "   const nextConfig = {};\n" +
        "   export default nextConfig;\n" +
        "   ```\n" +
        "\n(note: currently middlewares in Next.js are always run using the edge runtime)\n\n"
    );
  }

  return cloudflareContext;
}

/**
 * Performs some initial setup to integrate as best as possible the local Next.js dev server (run via `next dev`)
 * with the open-next Cloudflare adapter
 *
 * Note: this function should only be called inside the Next.js config file, and although async it doesn't need to be `await`ed
 */
export async function initOpenNextCloudflareForDev() {
  const context = await getCloudflareContextFromWrangler();

  addCloudflareContextToNodejsGlobal(context);

  await monkeyPatchVmModuleEdgeContext(context);
}

/**
 * Adds the cloudflare context to the global scope in which the Next.js dev node.js process runs in, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next.js uses the Node.js vm module's `runInContext()` function to evaluate edge functions
 * in a runtime context that tries to simulate as accurately as possible the actual production runtime
 * behavior, see: https://github.com/vercel/next.js/blob/9a1cd3/packages/next/src/server/web/sandbox/context.ts#L525-L527
 *
 * This function monkey-patches the Node.js `vm` module to override the `runInContext()` function so that the
 * cloudflare context is added to the runtime context's global scope before edge functions are evaluated
 *
 * @param cloudflareContext the cloudflare context to patch onto the "edge" runtime context global scope
 */
async function monkeyPatchVmModuleEdgeContext(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const require = (
    await import(/* webpackIgnore: true */ `${"__module".replaceAll("_", "")}`)
  ).default.createRequire(import.meta.url);

  // eslint-disable-next-line unicorn/prefer-node-protocol -- the `next dev` compiler doesn't accept the node prefix
  const vmModule = require("vm");

  const originalRunInContext = vmModule.runInContext.bind(vmModule);

  vmModule.runInContext = (
    code: string,
    contextifiedObject: Context,
    options?: RunningCodeOptions | string
  ) => {
    type RuntimeContext = Record<string, unknown> & {
      [cloudflareContextSymbol]?: CloudflareContext<CfProperties, Context>;
    };
    const runtimeContext = contextifiedObject as RuntimeContext;
    runtimeContext[cloudflareContextSymbol] ??= cloudflareContext;
    return originalRunInContext(code, contextifiedObject, options);
  };
}

/**
 * Gets a cloudflare context object from wrangler
 *
 * @returns the cloudflare context ready for use
 */
async function getCloudflareContextFromWrangler<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): Promise<CloudflareContext<CfProperties, Context>> {
  // Note: we never want wrangler to be bundled in the Next.js app, that's why the import below looks like it does
  const { getPlatformProxy } = await import(/* webpackIgnore: true */ `${"__wrangler".replaceAll("_", "")}`);
  const { env, cf, ctx } = await getPlatformProxy({
    // This allows the selection of a wrangler environment while running in next dev mode
    environment: process.env.NEXT_DEV_WRANGLER_ENV,
  });
  return {
    env,
    cf: cf as unknown as CfProperties,
    ctx: ctx as Context,
  };
}
