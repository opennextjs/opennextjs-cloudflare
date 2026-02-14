/** URL path prefix for DO proxy RPC requests. */
export const DO_RPC_PREFIX = "/do-rpc";

/**
 * DO namespace binding names used by OpenNext.
 * Shared between the proxy client (proxy-namespace) and handler (proxy-handler).
 */
export const NAMESPACE_BINDINGS = [
	"NEXT_TAG_CACHE_DO_SHARDED",
	"NEXT_CACHE_DO_QUEUE",
	"NEXT_CACHE_DO_PURGE",
] as const;

export type NamespaceBindingName = (typeof NAMESPACE_BINDINGS)[number];
