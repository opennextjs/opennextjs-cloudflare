import { generateMessageGroupId } from "@opennextjs/aws/core/routing/queue.js";
import logger from "@opennextjs/aws/logger.js";
import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides.js";

/**
 * The Memory Queue offers basic ISR revalidation by directly requesting a revalidation of a route.
 *
 * It offers basic support for in-memory de-duping per isolate.
 */
class MemoryQueue implements Queue {
  readonly name = "memory-queue";

  public revalidatedPaths = new Map<string, ReturnType<typeof setTimeout>>();

  public async send({ MessageBody: { host, url }, MessageGroupId }: QueueMessage): Promise<void> {
    this.revalidatedPaths.set(
      MessageGroupId,
      // force remove to allow new revalidations incase something went wrong
      setTimeout(() => this.removeId(MessageGroupId), 10_000)
    );

    try {
      // TODO: Drop the import - https://github.com/opennextjs/opennextjs-cloudflare/issues/361
      // @ts-expect-error
      const manifest = await import("./.next/prerender-manifest.json");
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
      this.revalidatedPaths.delete(MessageGroupId);
    }
  }

  private removeId(id: string) {
    clearTimeout(this.revalidatedPaths.get(id));
    this.revalidatedPaths.delete(id);
  }

  public remove(path: string) {
    if (this.revalidatedPaths.size > 0) {
      this.removeId(generateMessageGroupId(path));
    }
  }
}

export default new MemoryQueue();
