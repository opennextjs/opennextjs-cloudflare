import logger from "@opennextjs/aws/logger.js";
import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides.js";

import { getPrerenderManifest } from "./internal/manifest.js";

/**
 * The Memory Queue offers basic ISR revalidation by directly requesting a revalidation of a route.
 *
 * It offers basic support for in-memory de-duping per isolate.
 */
class MemoryQueue implements Queue {
  readonly name = "memory-queue";

  public revalidatedPaths = new Map<string, ReturnType<typeof setTimeout>>();

  public async send({ MessageBody: { host, url }, MessageGroupId }: QueueMessage): Promise<void> {
    if (this.revalidatedPaths.has(MessageGroupId)) return;

    this.revalidatedPaths.set(
      MessageGroupId,
      // force remove to allow new revalidations incase something went wrong
      setTimeout(() => this.revalidatedPaths.delete(MessageGroupId), 10_000)
    );

    try {
      const manifest = await getPrerenderManifest();
      const protocol = host.includes("localhost") ? "http" : "https";

      await globalThis.internalFetch(`${protocol}://${host}${url}`, {
        method: "HEAD",
        headers: {
          "x-prerender-revalidate": manifest.preview.previewModeId,
          "x-isr": "1",
        },
      });
    } catch (e) {
      logger.error(e);
    } finally {
      clearTimeout(this.revalidatedPaths.get(MessageGroupId));
      this.revalidatedPaths.delete(MessageGroupId);
    }
  }
}

export default new MemoryQueue();
