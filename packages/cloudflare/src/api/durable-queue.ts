import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./cloudflare-context";

export default {
  name: "durable-queue",
  send: async (msg: QueueMessage) => {
    const durableObject = getCloudflareContext().env.NEXT_CACHE_REVALIDATION_DURABLE_OBJECT;
    if (!durableObject) throw new IgnorableError("No durable object binding for cache revalidation");

    const id = durableObject.idFromName(msg.MessageGroupId);
    const stub = durableObject.get(id);
    const previewModeId = process.env.__NEXT_PREVIEW_MODE_ID!;
    await stub.revalidate({
      ...msg,
      previewModeId,
    });
  },
} satisfies Queue;
