import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides";

interface QueueCachingOptions {
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

  /**
   * Whether to wait for the queue ack before returning.
   * When set to false, the cache will be populated asap and the queue will be called after.
   * When set to true, the cache will be populated only after the queue ack is received.
   * @default false
   */
  waitForQueueAck?: boolean;
}

const DEFAULT_QUEUE_CACHE_TTL_SEC = 5;

class QueueCache implements Queue {
  readonly name;
  readonly enableRegionalCache: boolean;
  readonly regionalCacheTtlSec: number;
  readonly waitForQueueAck: boolean;
  cache: Cache | undefined;

  constructor(
    private originalQueue: Queue,
    options: QueueCachingOptions
  ) {
    this.name = `cached-${originalQueue.name}`;
    this.enableRegionalCache = options.enableRegionalCache ?? false;
    this.regionalCacheTtlSec = options.regionalCacheTtlSec ?? DEFAULT_QUEUE_CACHE_TTL_SEC;
    this.waitForQueueAck = options.waitForQueueAck ?? false;
  }

  async send(msg: QueueMessage) {
    if (this.enableRegionalCache) {
      const isCached = await this.isInCache(msg);
      if (isCached) {
        return;
      }
      if (!this.waitForQueueAck) {
        await this.putToCache(msg);
      }
    }

    await this.originalQueue.send(msg);
    if (this.waitForQueueAck) {
      await this.putToCache(msg);
    }
  }

  private async getCache() {
    if (!this.cache) {
      this.cache = await caches.open("durable-queue");
    }
    return this.cache;
  }

  private getCacheKey(msg: QueueMessage) {
    return new Request(
      new URL(`queue/${msg.MessageGroupId}/${msg.MessageDeduplicationId}`, "http://local.cache")
    );
  }

  private async putToCache(msg: QueueMessage) {
    const cacheKey = this.getCacheKey(msg);
    const cache = await this.getCache();
    await cache.put(
      cacheKey,
      new Response(null, { status: 200, headers: { "Cache-Control": `max-age=${this.regionalCacheTtlSec}` } })
    );
  }

  private async isInCache(msg: QueueMessage) {
    const cacheKey = this.getCacheKey(msg);
    const cache = await this.getCache();
    return await cache.match(cacheKey);
  }
}

export default (originalQueue: Queue, opts: QueueCachingOptions = {}) => new QueueCache(originalQueue, opts);
