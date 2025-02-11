import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

/**
 * The following Next.js code sets values in the incremental cache for fetch calls:
 *  https://github.com/vercel/next.js/blob/e5fc495e3d4/packages/next/src/server/lib/patch-fetch.ts#L690-L728
 *
 * The issue here is that this promise is never awaited in the Next.js code (since in a standard node.js server
 * the promise will eventually simply just run) but we do need to run it inside `waitUntil` (so that the worker
 * is not killed before the promise is fully executed), without that this promise gets discarded and values
 * don't get saved in the incremental cache.
 *
 * This function wraps the promise in a `waitUntil` call (retrieved from `globalThis.__openNextAls.getStore()`).
 */
export function patchFetchCacheSetMissingWaitUntil(updater: ContentUpdater) {
  return updater.updateContent(
    "patch-fetch-cache-set-missing-wait-until",
    {
      filter: getCrossPlatformPathRegex(
        String.raw`(server/chunks/.*\.js|.*\.runtime\..*\.js|patch-fetch\.js)$`,
        { escape: false }
      ),
      contentFilter: /arrayBuffer\(\)\s*\.then/,
    },
    ({ contents }) => patchCode(contents, rule)
  );
}

export const rule = `
rule:
  kind: call_expression
  pattern: $PROMISE
  all:
    - has: { pattern: $_.arrayBuffer().then, stopBy: end }
    - has: { pattern: "Buffer.from", stopBy: end }
    - any:
        - inside:
            kind: sequence_expression
            inside:
                kind: return_statement
        - inside:
            kind: expression_statement
            precedes:
                kind: return_statement
    - has: { pattern: $_.FETCH, stopBy: end }

fix: |
  globalThis.__openNextAls?.getStore()?.waitUntil?.($PROMISE)
`;
