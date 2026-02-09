import { injectDOProxyBindings } from "./proxy-namespace.js";

export { createDOProxyHandler } from "./proxy-handler.js";
export {
	createProxyDurableObjectNamespace,
	injectDOProxyBindings,
	ProxyDurableObjectId,
} from "./proxy-namespace.js";

/**
 * Wraps an ExportedHandler to inject DO proxy namespaces into env
 * before each request, enabling DO usage without direct DO bindings.
 *
 * Usage:
 * ```ts
 * import { withDOProxy } from "@opennextjs/cloudflare/do-proxy/index";
 * import openNextHandler from "./.open-next/worker.js";
 *
 * export default withDOProxy(openNextHandler);
 * ```
 */
export function withDOProxy(handler: ExportedHandler<CloudflareEnv>): ExportedHandler<CloudflareEnv> {
	const originalFetch = handler.fetch;
	if (!originalFetch) {
		throw new Error("withDOProxy: handler must define a fetch method");
	}
	return {
		...handler,
		fetch(request, env, ctx) {
			injectDOProxyBindings(env);
			return originalFetch(request, env, ctx);
		},
	};
}
