export const cacheHandlerFileName = "cache-handler.mjs";

/**
 * Install the cloudflare KV cache handler
 */
export function patchCache(code: string): string {
  console.log("# patchCache");

  const patchedCode = code.replace(
    "const { cacheHandler } = this.nextConfig;",
    `const cacheHandler = null;
CacheHandler = (await import('./${cacheHandlerFileName}')).OpenNextCacheHandler;
`
  );

  if (patchedCode === code) {
    throw new Error("Patch `patchCache` not applied");
  }

  return patchedCode;
}
