import { generateMessageGroupId } from "@opennextjs/aws/core/routing/queue.js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import cache from "./memory-queue";

vi.mock("./.next/prerender-manifest.json", () => ({
  preview: { previewModeId: "id" },
}));

const defaultOpts = {
  MessageBody: { host: "test.local", url: "/test" },
  MessageGroupId: generateMessageGroupId("/test"),
  MessageDeduplicationId: "",
};

describe("MemoryQueue", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    globalThis.internalFetch = vi.fn();
  });

  it("should de-dupe revalidations", async () => {
    await cache.send(defaultOpts);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);
    await cache.send(defaultOpts);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);

    cache.remove("/test");

    await cache.send(defaultOpts);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(2);
    await cache.send(defaultOpts);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);

    await cache.send(defaultOpts);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(3);

    await cache.send({ ...defaultOpts, MessageGroupId: generateMessageGroupId("/other") });
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(4);
  });
});
