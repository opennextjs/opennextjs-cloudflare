/**
 * When using SSG and `dynamicParams = false`, Next.js throws a NoFallbackError. This error is
 * bubbled up by default in Node.js servers, however this causes issues in the workerd with
 * the current response handling and streaming implementation we have, and leads to hanging
 * promises.
 */
export function patchExceptionBubbling(code: string) {
  // The code before had: `query._nextBubbleNoFallback = '1'`, that has ben refactored to
  // `addRequestMeta(req, 'bubbleNoFallback', true)` in https://github.com/vercel/next.js/pull/74100
  // we need to support both for backward compatibility, that's why we have the following if statement
  if (code.includes("_nextBubbleNoFallback")) {
    return code.replace('_nextBubbleNoFallback = "1"', "_nextBubbleNoFallback = undefined");
  }

  // The Next.js transpiled code contains something like `(0, _requestmeta.addRequestMeta)(req, "bubbleNoFallback", true);`
  // and we want to update it to `(0, _requestmeta.addRequestMeta)(req, "bubbleNoFallback", false);`
  return code.replace(/\((.*?.addRequestMeta\)\(.*?,\s+"bubbleNoFallback"),\s+true\)/, "($1, false)");
}
