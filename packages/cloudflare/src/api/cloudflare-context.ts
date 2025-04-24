import type { Context, RunningCodeOptions } from "node:vm";

import type { GetPlatformProxyOptions } from "wrangler";

import type { DOQueueHandler } from "./durable-objects/queue";
import { DOShardedTagCache } from "./durable-objects/sharded-tag-cache";

declare global {
  interface CloudflareEnv {
    // Asset binding
    ASSETS?: Fetcher;

    // Environment to use when loading Next `.env` files
    // Default to "production"
    NEXTJS_ENV?: string;

    // Service binding for the worker itself to be able to call itself from within the worker
    WORKER_SELF_REFERENCE?: Service;

    // KV used for the incremental cache
    NEXT_INC_CACHE_KV?: KVNamespace;

    // R2 bucket used for the incremental cache
    NEXT_INC_CACHE_R2_BUCKET?: R2Bucket;
    // Prefix used for the R2 incremental cache bucket
    NEXT_INC_CACHE_R2_PREFIX?: string;

    // D1 db used for the tag cache
    NEXT_TAG_CACHE_D1?: D1Database;

    // Durables object namespace to use for the sharded tag cache
    NEXT_TAG_CACHE_DO_SHARDED?: DurableObjectNamespace<DOShardedTagCache>;
    // Queue of failed tag write
    // Optional, could be used to monitor or reprocess failed writes
    NEXT_TAG_CACHE_DO_SHARDED_DLQ?: Queue;

    // Durable Object namespace to use for the durable object queue
    NEXT_CACHE_DO_QUEUE?: DurableObjectNamespace<DOQueueHandler>;

    // Below are the optional environment variables to configure the durable object queue
    // The max number of revalidations that can be processed by the durable worker at the same time
    NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION?: string;
    // The max time in milliseconds that a revalidation can take before being considered as failed
    NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS?: string;
    // The amount of time after which a revalidation will be attempted again if it failed
    // If it fails again it will exponentially back off until it reaches the max retry interval
    NEXT_CACHE_DO_QUEUE_RETRY_INTERVAL_MS?: string;
    // The maximum number of attempts that can be made to revalidate a path
    NEXT_CACHE_DO_QUEUE_MAX_RETRIES?: string;
    // Disable SQLite for the durable object queue handler
    // This can be safely used if you don't use an eventually consistent incremental cache (i.e. R2 without the regional cache for example)
    NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE?: string;

    // Environment variables for vercel/ai-chat
    VERCEL_AI_CHAT_API_KEY?: string;
    VERCEL_AI_CHAT_VECTOR_DB?: string;
    VERCEL_AI_CHAT_DURABLE_CHAT?: DurableObjectNamespace;
    VERCEL_AI_CHAT_KV_NAMESPACE?: KVNamespace;
    VERCEL_AI_CHAT_R2_BUCKET?: R2Bucket;
    VERCEL_AI_CHAT_D1_DATABASE?: D1Database;
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
 * `globalThis` override for internal usage
 */
type InternalGlobalThis<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
> = typeof globalThis & {
  [cloudflareContextSymbol]: CloudflareContext<CfProperties, Context> | undefined;
  __NEXT_DATA__: Record<string, unknown>;
};

type GetCloudflareContextOptions = {
  /**
   * When `true`, `getCloudflareContext` returns a promise of the cloudflare context instead of the context,
   * this is needed to access the context from statically generated routes.
   */
  async: boolean;
};

/**
 * Utility to get the current Cloudflare context
 *
 * @returns the cloudflare context
 */
export function getCloudflareContext<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(options: { async: true }): Promise<CloudflareContext<CfProperties, Context>>;
export function getCloudflareContext<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(options?: { async: false }): CloudflareContext<CfProperties, Context>;
export function getCloudflareContext<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(
  options: GetCloudflareContextOptions = { async: false }
): CloudflareContext<CfProperties, Context> | Promise<CloudflareContext<CfProperties, Context>> {
  return options.async ? getCloudflareContextAsync() : getCloudflareContextSync();
}

/**
 * Get the cloudflare context from the current global scope
 */
function getCloudflareContextFromGlobalScope<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): CloudflareContext<CfProperties, Context> | undefined {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  return global[cloudflareContextSymbol];
}

/**
 * Detects whether the current code is being evaluated in a statically generated route
 */
function inSSG<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): boolean {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  // Note: Next.js sets globalThis.__NEXT_DATA__.nextExport to true for SSG routes
  // source: https://github.com/vercel/next.js/blob/4e394608423/packages/next/src/export/worker.ts#L55-L57)
  return global.__NEXT_DATA__?.nextExport === true;
}

/**
 * Utility to get the current Cloudflare context in sync mode
 */
function getCloudflareContextSync<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): CloudflareContext<CfProperties, Context> {
  const cloudflareContext = getCloudflareContextFromGlobalScope<CfProperties, Context>();

  if (cloudflareContext) {
    return cloudflareContext;
  }

  // The sync mode of `getCloudflareContext`, relies on the context being set on the global state
  // by either the worker entrypoint (in prod) or by `initOpenNextCloudflareForDev` (in dev), neither
  // can work during SSG since for SSG Next.js creates (jest) workers that don't get access to the
  // normal global state so we throw with a helpful error message.
  if (inSSG()) {
    throw new Error(
      `\n\nERROR: \`getCloudflareContext\` has been called in sync mode in either a static route or at the top level of a non-static one,` +
        ` both cases are not allowed but can be solved by either:\n` +
        `  - make sure that the call is not at the top level and that the route is not static\n` +
        `  - call \`getCloudflareContext({async: true})\` to use the \`async\` mode\n` +
        `  - avoid calling \`getCloudflareContext\` in the route\n`
    );
  }

  throw new Error(initOpenNextCloudflareForDevErrorMsg);
}

/**
 * Utility to get the current Cloudflare context in async mode
 */
async function getCloudflareContextAsync<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(): Promise<CloudflareContext<CfProperties, Context>> {
  const cloudflareContext = getCloudflareContextFromGlobalScope<CfProperties, Context>();

  if (cloudflareContext) {
    return cloudflareContext;
  }

  // Note: Next.js sets process.env.NEXT_RUNTIME to 'nodejs' when the runtime in use is the node.js one
  // We want to detect when the runtime is the node.js one so that during development (`next dev`) we know wether
  // we are or not in a node.js process and that access to wrangler's node.js apis
  const inNodejsRuntime = process.env.NEXT_RUNTIME === "nodejs";

  if (inNodejsRuntime || inSSG()) {
    // we're in a node.js process and also in "async mode" so we can use wrangler to asynchronously get the context
    const cloudflareContext = await getCloudflareContextFromWrangler<CfProperties, Context>();
    addCloudflareContextToNodejsGlobal(cloudflareContext);
    return cloudflareContext;
  }

  throw new Error(initOpenNextCloudflareForDevErrorMsg);
}

/**
 * Performs some initial setup to integrate as best as possible the local Next.js dev server (run via `next dev`)
 * with the open-next Cloudflare adapter
 *
 * Note: this function should only be called inside the Next.js config file, and although async it doesn't need to be `await`ed
 * @param options options on how the function should operate and if/where to persist the platform data
 */
export async function initOpenNextCloudflareForDev(options?: GetPlatformProxyOptions) {
  const shouldInitializationRun = shouldContextInitializationRun();
  if (!shouldInitializationRun) return;

  if (options?.environment && process.env.NEXT_DEV_WRANGLER_ENV) {
    console.warn(
      `'initOpenNextCloudflareForDev' has been called with an environment option while NEXT_DEV_WRANGLER_ENV is set.` +
        ` NEXT_DEV_WRANGLER_ENV will be ignored and the environment will be set to: '${options.environment}'`
    );
  }

  const context = await getCloudflareContextFromWrangler(options);

  addCloudflareContextToNodejsGlobal(context);

  await monkeyPatchVmModuleEdgeContext(context);
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is only set in one of the
  // two processes so we're using it as the differentiator between the two
  const AsyncLocalStorage = (globalThis as unknown as { AsyncLocalStorage?: unknown })["AsyncLocalStorage"];
  return !!AsyncLocalStorage;
}

/**
 * Adds the cloudflare context to the global scope of the current node.js process, enabling
 * future calls to `getCloudflareContext` to retrieve and return such context
 *
 * @param cloudflareContext the cloudflare context to add to the node.sj global scope
 */
function addCloudflareContextToNodejsGlobal<
  CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
  Context = ExecutionContext,
>(cloudflareContext: CloudflareContext<CfProperties, Context>) {
  const global = globalThis as InternalGlobalThis<CfProperties, Context>;
  global[cloudflareContextSymbol] = cloudflareContext;
}

/**
 * Next dev server imports the config file twice (in two different processes, making it hard to track),
 * this causes the initialization to run twice as well, to keep things clean, not allocate extra
 * resources (i.e. instantiate two miniflare instances) and avoid extra potential logs, it would be best
 * to run the initialization only once, this function is used to try to make it so that it does, it returns
 * a flag which indicates if the initialization should run in the current process or not.
 *
 * @returns boolean indicating if the initialization should run
 */
function shouldContextInitializationRun(): boolean {
  // via debugging we've seen that AsyncLocalStorage is
