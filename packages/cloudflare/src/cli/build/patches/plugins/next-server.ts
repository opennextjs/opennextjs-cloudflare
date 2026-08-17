/**
 * Misc patches for `next-server.js`
 *
 * Note: we will probably need to revisit the patches when the Next adapter API lands
 *
 * - Inline `getBuildId` as it relies on `readFileSync` that is not supported by workerd
 * - Override the cache and composable cache handlers
 */

import path from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { normalizePath } from "../../../utils/normalize-path.js";

export function patchNextServer(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
	return updater.updateContent("next-server", [
		{
			filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/next-server\.js$`, {
				escape: false,
			}),
			contentFilter: /getBuildId\(/,
			callback: async ({ contents }) => {
				const { outputDir } = buildOpts;

				contents = patchCode(contents, buildIdRule);

				const outputPath = path.join(outputDir, "server-functions/default");
				const cacheHandler = path.join(outputPath, getPackagePath(buildOpts), "cache.cjs");
				contents = patchCode(contents, createCacheHandlerRule(cacheHandler));

				const composableCacheHandler = path.join(
					outputPath,
					getPackagePath(buildOpts),
					"composable-cache.cjs"
				);
				contents = patchCode(contents, createComposableCacheHandlersRule(composableCacheHandler));

				// Node middleware are not supported on Cloudflare yet
				contents = patchCode(contents, disableNodeMiddlewareRule);

				contents = patchCode(contents, attachRequestMetaRule);

				contents = patchCode(contents, registerRouterServerContextRule);

				return contents;
			},
		},
	]);
}

// Do not try to load Node middlewares
export const disableNodeMiddlewareRule = `
rule:
  pattern:
    selector: method_definition
    context: "class { async loadNodeMiddleware($$$PARAMS) { $$$_ } }"
fix: |-
  async loadNodeMiddleware($$$PARAMS) {
    // patched by open next
  }
`;

export const buildIdRule = `
rule:
  pattern:
    selector: method_definition
    context: "class { getBuildId($$$PARAMS) { $$$_ } }"
fix: |-
  getBuildId($$$PARAMS) {
    return process.env.NEXT_BUILD_ID;
  }
`;

/**
 * The cache handler used by Next.js is normally defined in the config file as a path. At runtime,
 * Next.js would then do a dynamic require on a transformed version of the path to retrieve the
 * cache handler and create a new instance of it.
 *
 * This is problematic in workerd due to the dynamic import of the file that is not known from
 * build-time. Therefore, we have to manually override the default way that the cache handler is
 * instantiated with a dynamic require that uses a string literal for the path.
 */
export function createCacheHandlerRule(handlerPath: string) {
	return `
rule:
  pattern: "const { cacheHandler } = this.nextConfig;"
  inside:
    kind: method_definition
    has:
      field: name
      regex: ^getIncrementalCache$
    stopBy: end

fix: |-
  const cacheHandler = null;
  CacheHandler = require('${normalizePath(handlerPath)}').default;
`;
}

export function createComposableCacheHandlersRule(handlerPath: string) {
	return `
rule:
  # matches
  # - const { cacheHandlers } = this.nextConfig.experimental; pre Next 16
  # - const { cacheMaxMemorySize, cacheHandlers } = this.nextConfig; from Next 16
  kind: lexical_declaration
  regex: cacheHandlers
  inside:
    kind: method_definition
    has:
      field: name
      regex: ^loadCustomCacheHandlers$
    stopBy: end

fix: |-
  const cacheHandlers = null;
  const handlersSymbol = Symbol.for('@next/cache-handlers');
  const handlersMapSymbol = Symbol.for('@next/cache-handlers-map');
  const handlersSetSymbol = Symbol.for('@next/cache-handlers-set');
  globalThis[handlersMapSymbol] = new Map();
  globalThis[handlersMapSymbol].set("default", require('${normalizePath(handlerPath)}').default);
  globalThis[handlersMapSymbol].set("remote", require('${normalizePath(handlerPath)}').default);
  globalThis[handlersSetSymbol] = new Set(globalThis[handlersMapSymbol].values());
`;
}

/**
 * `attachRequestMeta` sets `initUrl` to always be with `https` cause this.fetchHostname && this.port is undefined in our case.
 * this.nextConfig.experimental.trustHostHeader is also true.
 *
 * This patch checks if the original protocol was "http:" and rewrites the `initUrl` to reflect the actual host protocol.
 * It will make `request.url` in route handlers end up with the correct protocol.
 *
 * Note: We cannot use the already defined `initURL` we passed in as requestMetaData to NextServer's request handler as pages router
 * data routes would fail. It would miss the `_next/data` part in the path in that case.
 *
 * Therefor we just replace the protocol if necessary in the value from this template string:
 * https://github.com/vercel/next.js/blob/ea08bf27/packages/next/src/server/next-server.ts#L1920
 *
 * Affected lines:
 * https://github.com/vercel/next.js/blob/ea08bf27/packages/next/src/server/next-server.ts#L1916-L1923
 *
 * Callstack: handleRequest-> handleRequestImpl -> attachRequestMeta
 *
 */
/**
 * Registers a `routerServerContext` (with a working `render404`) before any request is handled,
 * instead of relying on Next.js's own lazy self-registration.
 *
 * Next.js's Pages Router falls back to a bare, hardcoded `"This page could not be found"` body
 * (see `next/dist/server/route-modules/pages/pages-handler.js`) whenever a page's
 * `getStaticProps`/`getServerSideProps` returns `{ notFound: true }` and no `routerServerContext.render404`
 * is available - instead of rendering the app's actual `pages/404`/`pages/_error`.
 *
 * `routerServerContext` is read from a well-known global registry
 * (`routerServerGlobal[RouterServerContextSymbol][relativeProjectDir]`, see
 * `next/dist/server/lib/router-utils/router-server-context.js`) that a real `next start` router-server
 * process populates upfront. `NextNodeServer` (`next/dist/server/next-server.js`) *does* also
 * self-register into that same registry, but only lazily, inside `handleCatchallRenderRequest`
 * (i.e. only once an unmatched/catch-all path is hit).
 *
 * OpenNext never runs a router-server process and constructs a bare `NextServer` directly
 * (see `@opennextjs/aws`'s `dist/core/util.js`), calling `getRequestHandler()`/`makeRequestHandler()`
 * once at startup. Any request that matches a real page - i.e. it never goes through
 * `handleCatchallRenderRequest` - can therefore be the very first request handled in a Worker
 * isolate, before Next.js's lazy self-registration has ever run. If that page's data method returns
 * `notFound: true`, `routerServerContext` is `undefined` in `RouteModule#prepare()`, `render404` is
 * unavailable, and Next.js falls back to the bare hardcoded body instead of the designed 404 page.
 *
 * We fix this by performing the same self-registration Next.js already does in
 * `handleCatchallRenderRequest` (reusing `this.render404`, which correctly renders `pages/404`/
 * `pages/_error` - it's the same method that already powers 404s for genuinely unmatched paths),
 * but unconditionally in `makeRequestHandler()`, which always runs before the request handler is
 * returned and therefore before any request - matched or not - can reach the route module.
 *
 * Prior art: this mirrors the fix Cloudflare's `vinext` project shipped for the equivalent Pages
 * Router bug - rerouting `notFound` results to the app's actual 404/error page instead of a
 * built-in fallback - see https://github.com/cloudflare/vinext/pull/1737 and
 * https://github.com/cloudflare/vinext/pull/2773 (header preservation follow-up).
 */
// Note: this deliberately does NOT capture the whole `makeRequestHandler` body via a `$$$BODY`
// meta-variable (e.g. `context: "class { makeRequestHandler() { $$$BODY } }"`). Doing so requires
// ast-grep to re-serialize the captured statements, and at least in Next.js 16.2.11's
// `next-server.js`, `makeRequestHandler`'s first statement (`this.prepare().catch(...)`) is preceded
// by several consecutive single-line (`//`) comments. Re-serializing them collapses them onto one
// line, which turns everything after the first `//` - including `this.prepare().catch(...)` itself -
// into a comment, corrupting the method and breaking the build with a syntax error.
//
// Matching only the `return (req, res, parsedUrl) => ...` statement and inserting before it avoids
// capturing/reprinting any of the method's other statements (and their leading comments) entirely.
export const registerRouterServerContextRule = `
rule:
  kind: return_statement
  pattern: return $EXPR;
  inside:
    kind: method_definition
    has:
      field: name
      regex: ^makeRequestHandler$
    stopBy: end
fix: |-
  if (!_routerservercontext.routerServerGlobal[_routerservercontext.RouterServerContextSymbol]) {
    _routerservercontext.routerServerGlobal[_routerservercontext.RouterServerContextSymbol] = {};
  }
  // Note: this is hardcoded to "" rather than computed via \`_path.relative(process.cwd(), this.dir)\`
  // (which is what Next.js's own self-registration in \`handleCatchallRenderRequest\` does) because
  // \`process.cwd()\` at request-handling time is not guaranteed to match \`process.cwd()\` at
  // \`NextNodeServer\` construction time in this runtime (observed to differ by one directory level,
  // e.g. yielding ".." here). The read side, \`RouteModule#getRouterServerContext\`, falls back to
  // \`this.relativeProjectDir\`, which every route module in the OpenNext build has hardcoded to ""
  // (OpenNext always constructs \`NextServer\` with \`dir: ""\`). Using "" here keeps the write side in
  // sync with that build-time constant instead of a runtime-computed value that can drift from it.
  const relativeProjectDir = "";
  const existingServerContext = _routerservercontext.routerServerGlobal[_routerservercontext.RouterServerContextSymbol][relativeProjectDir];
  if (!existingServerContext) {
    _routerservercontext.routerServerGlobal[_routerservercontext.RouterServerContextSymbol][relativeProjectDir] = {
      render404: this.render404.bind(this)
    };
  }
  _routerservercontext.routerServerGlobal[_routerservercontext.RouterServerContextSymbol][relativeProjectDir].nextConfig = this.nextConfig;
  _routerservercontext.routerServerGlobal[_routerservercontext.RouterServerContextSymbol][relativeProjectDir].isWrappedByNextServer = true;
  return $EXPR;
`;

export const attachRequestMetaRule = `
rule:
  kind: identifier
  regex: ^initUrl$
  inside:
    kind: arguments
    all:
      - has: {kind: identifier, regex: ^req$}
      - has: {kind: string, regex: initURL}
    inside:
      kind: call_expression
      all:
        - has: {kind: parenthesized_expression, regex: '0'}
        - has: { regex: _requestmeta.addRequestMeta}
      inside:
        kind: expression_statement
        inside:
          kind: statement_block
          inside:
            kind: method_definition
            has:
              kind: property_identifier
              regex: ^attachRequestMeta$
fix:
  'req[Symbol.for("NextInternalRequestMeta")]?.initProtocol === "http:" && initUrl.startsWith("https://") ? \`http://\${initUrl.slice(8)}\`: initUrl'`;
