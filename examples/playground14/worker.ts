// @ts-ignore `.open-next/worker.ts` is generated at build time
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  /**
   * Scheduled Handler
   *
   * Can be tested with:
   * - `wrangler dev --test-scheduled`
   * - `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`
   * @param event
   */
  async scheduled(event) {
    console.log("Scheduled event", event);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-ignore `.open-next/worker.ts` is generated at build time
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
