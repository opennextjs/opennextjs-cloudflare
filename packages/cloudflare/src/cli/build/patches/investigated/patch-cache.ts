import { Config } from "../../../config";
import path from "node:path";

/**
 * Install the cloudflare KV cache handler
 */
export function patchCache(code: string, config: Config): string {
  console.log("# patchCached");

  const cacheHandler = path.join(config.paths.internalPackage, "cli", "cache-handler.mjs");

  const patchedCode = code.replace(
    "const { cacheHandler } = this.nextConfig;",
    `const cacheHandler = null;
CacheHandler = (await import('${cacheHandler}')).default;
CacheHandler.maybeKVNamespace = process.env["${config.cache.kvBindingName}"];
`
  );

  if (patchedCode === code) {
    throw new Error("Cache patch not applied");
  }

  return patchedCode;
}
