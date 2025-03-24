import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context";

interface DurableQueueOptions {
  /**
   * Enables a regional cache for the queue.
   * When enabled, the first request to the queue is cached for `regionalCacheTtlSec` seconds.
   * Subsequent similar requests during this period will bypass processing and use the cached result.
   * **Note:** Ensure the `MAX_REVALIDATE_CONCURRENCY` environment variable is appropriately increased before enabling this feature.
   * In case of an error, cache revalidation may be delayed by up to `regionalCacheTtlSec` seconds.
   * @default false
   */
  enableRegionalCache?: boolean;
  /**
   * The TTL for the regional cache in seconds.
   * @default 5
   */
  regionalCacheTtlSec?: number;
}

const DEFAULT_QUEUE_CACHE_TTL_SEC = 5;

function getCacheKey(msg: QueueMessage) {
  return new Request(
    new URL(`queue/${msg.MessageGroupId}/${msg.MessageDeduplicationId}`, "http://local.cache")
  );
}

export default ({enableRegionalCache, regionalCacheTtlSec}: DurableQueueOptions = {}) => {
  return {
    name: "durable-queue",
    send: async (msg: QueueMessage) => {
      const durableObject = getCloudflareContext().env.NEXT_CACHE_DO_QUEUE;
      if (!durableObject) throw new IgnorableError("No durable object binding for cache revalidation");

      if(enableRegionalCache) {
        const cacheKey = getCacheKey(msg);
        const cache = await caches.open("durable-queue");
        const cachedResponse = await cache.match(cacheKey);
        if(cachedResponse) {
          return;
        }
        
        // Here we cache the first request to the queue for `regionalCacheTtlSec` seconds
        // We want to do it as soon as possible so that subsequent requests can use the cached response
        // TODO: Do we really want to cache this before sending the message to the queue? It could be an option to cache it after the message is sent
        await cache.put(cacheKey, new Response(null, { status: 200, headers: { "Cache-Control": `max-age=${regionalCacheTtlSec ?? DEFAULT_QUEUE_CACHE_TTL_SEC}` } }));

      }
  
      const id = durableObject.idFromName(msg.MessageGroupId);
      const stub = durableObject.get(id);
      await stub.revalidate({
        ...msg,
      });
    },
  } satisfies Queue;
}
