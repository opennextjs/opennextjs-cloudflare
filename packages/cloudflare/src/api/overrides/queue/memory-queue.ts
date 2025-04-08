import { error } from "@opennextjs/aws/adapters/logger.js";
import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context";
import { debugCache } from "../internal";

export const DEFAULT_REVALIDATION_TIMEOUT_MS = 10_000;

/**
 * The Memory Queue offers basic ISR revalidation by directly requesting a revalidation of a route.
 *
 * It offers basic support for in-memory de-duping per isolate.
 *
 * A service binding called `WORKER_SELF_REFERENCE` that points to your worker is required.
 */
export class MemoryQueue implements Queue {
  readonly name = "memory-queue";

  revalidatedPaths = new Set<string>();

  constructor(private opts = { revalidationTimeoutMs: DEFAULT_REVALIDATION_TIMEOUT_MS }) {}

  async send({ MessageBody: { host, url }, MessageDeduplicationId }: QueueMessage): Promise<void> {
    const service = getCloudflareContext().env.WORKER_SELF_REFERENCE;
    if (!service) throw new IgnorableError("No service binding for cache revalidation worker");

    if (this.revalidatedPaths.has(MessageDeduplicationId)) return;

    this.revalidatedPaths.add(MessageDeduplicationId);

    try {
      const protocol = host.includes("localhost") ? "http" : "https";

      // TODO: Drop the import - https://github.com/opennextjs/opennextjs-cloudflare/issues/361
      // @ts-ignore
      const manifest = await import("./.next/prerender-manifest.json");
      const response = await service.fetch(`${protocol}://${host}${url}`, {
        method: "HEAD",
        headers: {
          "x-prerender-revalidate": manifest.preview.previewModeId,
          "x-isr": "1",
        },
        // We want to timeout the revalidation to avoid hanging the queue
        signal: AbortSignal.timeout(this.opts.revalidationTimeoutMs),
      });

      // Here we want at least to log when the revalidation was not successful
      if (response.status !== 200 || response.headers.get("x-nextjs-cache") !== "REVALIDATED") {
        error(`Revalidation failed for ${url} with status ${response.status}`);
      }
      debugCache(`Revalidation successful for ${url}`);
    } catch (e) {
      error(e);
    } finally {
      this.revalidatedPaths.delete(MessageDeduplicationId);
    }
  }
}

export default new MemoryQueue();
