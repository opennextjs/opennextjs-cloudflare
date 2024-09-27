import { type CacheHandler, type CacheHandlerContext } from "next/dist/server/lib/incremental-cache";
import type { IncrementalCacheEntry, IncrementalCacheValue } from "next/dist/server/response-cache";
import { KVNamespace } from "@cloudflare/workers-types";

export default class CfWorkersKvCacheHandler implements CacheHandler {
  static maybeKVNamespace: KVNamespace | undefined = undefined;

  constructor(protected ctx: CacheHandlerContext) {}

  async get(key: string): Promise<IncrementalCacheEntry | null> {
    if (CfWorkersKvCacheHandler.maybeKVNamespace === undefined) {
      return null;
    }

    console.log(`[Cf] Getting cache[${key}]`);

    try {
      return (await CfWorkersKvCacheHandler.maybeKVNamespace.get(key, "json")) ?? null;
    } catch (e) {
      console.error(`Failed to get value for key = ${key}: ${e}`);
      return null;
    }
  }

  async set(
    key: string,
    entry: IncrementalCacheValue | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ctx: {
      revalidate?: number | false;
      fetchCache?: boolean;
      fetchUrl?: string;
      fetchIdx?: number;
      tags?: string[];
    }
  ) {
    if (CfWorkersKvCacheHandler.maybeKVNamespace === undefined) {
      return;
    }

    console.log(`[Cf] Setting cache[${key}]`);

    try {
      const data = {
        lastModified: Date.now(),
        value: entry,
      };
      await CfWorkersKvCacheHandler.maybeKVNamespace.put(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to set value for key = ${key}: ${e}`);
    }
  }

  async revalidateTag(tags: string | string[]) {
    if (CfWorkersKvCacheHandler.maybeKVNamespace === undefined) {
      return;
    }

    tags = [tags].flat();
    console.log(`[Cf] revalidateTag ${JSON.stringify(tags)}}`);
  }

  resetRequestCache(): void {}
}
