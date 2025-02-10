import { generateMessageGroupId } from "@opennextjs/aws/core/routing/queue.js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import cache from "./memory-queue";

vi.mock("./internal/manifest.js", () => ({
  getPrerenderManifest: () => ({ preview: { previewModeId: "id" } }),
}));

const defaultOpts = {
  MessageBody: { host: "test.local", url: "/test" },
  MessageGroupId: generateMessageGroupId("/test"),
  MessageDeduplicationId: "",
};

describe("MemoryQueue", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    globalThis.internalFetch = vi.fn().mockReturnValue(new Promise((res) => setTimeout(() => res(true), 1)));
  });

  it("should de-dupe revalidations", async () => {
    const firstBatch = [cache.send(defaultOpts), cache.send(defaultOpts)];
    vi.advanceTimersByTime(1);
    await Promise.all(firstBatch);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);

    const secondBatch = [cache.send(defaultOpts)];
    vi.advanceTimersByTime(10_000);
    await Promise.all(secondBatch);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(2);

    const thirdBatch = [
      cache.send(defaultOpts),
      cache.send({ ...defaultOpts, MessageGroupId: generateMessageGroupId("/other") }),
    ];
    vi.advanceTimersByTime(1);
    await Promise.all(thirdBatch);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(4);
  });
});
