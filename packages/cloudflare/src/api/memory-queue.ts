import logger from "@opennextjs/aws/logger.js";
import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides.js";

export const DEFAULT_REVALIDATION_TIMEOUT_MS = 10_000;

/**
 * The Memory Queue offers basic ISR revalidation by directly requesting a revalidation of a route.
 *
 * It offers basic support for in-memory de-duping per isolate.
 */
export class MemoryQueue implements Queue {
  readonly name = "memory-queue";

  revalidatedPaths = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private opts = { revalidationTimeoutMs: DEFAULT_REVALIDATION_TIMEOUT_MS }) {}

  async send({ MessageBody: { host, url }, MessageGroupId }: QueueMessage): Promise<void> {
    if (this.revalidatedPaths.has(MessageGroupId)) return;

    this.revalidatedPaths.set(
      MessageGroupId,
      // force remove to allow new revalidations incase something went wrong
      setTimeout(() => this.revalidatedPaths.delete(MessageGroupId), this.opts.revalidationTimeoutMs)
    );

    try {
      const protocol = host.includes("localhost") ? "http" : "https";

      // TODO: Drop the import - https://github.com/opennextjs/opennextjs-cloudflare/issues/361
      // @ts-ignore
      const manifest = await import("./.next/prerender-manifest.json");
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
