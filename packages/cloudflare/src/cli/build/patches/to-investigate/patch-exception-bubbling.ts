/**
 * When using SSG and `dynamicParams = false`, Next.js throws a NoFallbackError. This error is
 * bubbled up by default in Node.js servers, however this causes issues in the workerd with
 * the current response handling and streaming implementation we have, and leads to hanging
 * promises.
 */
export function patchExceptionBubbling(code: string) {
  console.log("# patchExceptionBubbling");

  const patchedCode = code.replace('_nextBubbleNoFallback = "1"', "_nextBubbleNoFallback = undefined");

  if (patchedCode === code) {
    throw new Error("Patch `patchExceptionBubbling` not applied");
  }

  return patchedCode;
}
