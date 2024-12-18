/**
 * When using SSG and `dynamicParams = false`, Next.js throws a NoFallbackError. This error is
 * bubbled up by default in Node.js servers, however this causes issues in the workerd with
 * the current response handling and streaming implementation we have, and leads to hanging
 * promises.
 */
export function patchExceptionBubbling(code: string) {
  return code.replace('_nextBubbleNoFallback = "1"', "_nextBubbleNoFallback = undefined");
}
