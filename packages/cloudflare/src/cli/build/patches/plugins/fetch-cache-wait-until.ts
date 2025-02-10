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
    { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/, contentFilter: /Failed to set fetch cache/ },
    ({ contents }) => {
      contents = patchCode(contents, ruleForMinifiedCode);
      return patchCode(contents, ruleForNonMinifiedCode);
    }
  );
}

export const ruleForMinifiedCode = `
rule:
  pattern: return $PROMISE, $CLONED2
  regex: Failed to set fetch cache
  follows:
    kind: lexical_declaration
    pattern: let [$CLONED1, $CLONED2]

fix: |
  globalThis.__openNextAls?.getStore()?.waitUntil?.($PROMISE);
  return $CLONED2;
`;

export const ruleForNonMinifiedCode = `
rule:
  regex: Failed to set fetch cache
  pattern: $PROMISE;
  follows:
    kind: comment
    follows:
      kind: comment
      follows:
        kind: comment
        follows:
          kind: lexical_declaration
          pattern: const [cloned1, cloned2]

fix: |
  globalThis.__openNextAls?.getStore()?.waitUntil?.($PROMISE);
`;
