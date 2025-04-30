import { NextModeTagCache } from "@opennextjs/aws/types/overrides";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { softTagFilter, withFilter } from "./tag-cache-filter";

const mockedTagCache = {
  name: "mocked",
  mode: "nextMode",
  getLastRevalidated: vi.fn(),
  getPathsByTags: vi.fn(),
  hasBeenRevalidated: vi.fn(),
  writeTags: vi.fn(),
} satisfies NextModeTagCache;

const filterFn = (tag: string) => tag.startsWith("valid_");

describe("withFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should filter out tags based on writeTags", async () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn,
    });

    const tags = ["valid_tag", "invalid_tag"];

    await tagCache.writeTags(tags);
    expect(mockedTagCache.writeTags).toHaveBeenCalledWith(["valid_tag"]);
  });

  it("should not call writeTags if no tags are valid", async () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn,
    });
    const tags = ["invalid_tag"];
    await tagCache.writeTags(tags);
    expect(mockedTagCache.writeTags).not.toHaveBeenCalled();
  });

  it("should filter out tags based on hasBeenRevalidated", async () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn,
    });

    const tags = ["valid_tag", "invalid_tag"];
    const lastModified = Date.now();

    await tagCache.hasBeenRevalidated(tags, lastModified);
    expect(mockedTagCache.hasBeenRevalidated).toHaveBeenCalledWith(["valid_tag"], lastModified);
  });

  it("should not call hasBeenRevalidated if no tags are valid", async () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn,
    });
    const tags = ["invalid_tag"];
    const lastModified = Date.now();
    await tagCache.hasBeenRevalidated(tags, lastModified);
    expect(mockedTagCache.hasBeenRevalidated).not.toHaveBeenCalled();
  });

  it("should filter out tags based on getPathsByTags", async () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn,
    });

    const tags = ["valid_tag", "invalid_tag"];

    await tagCache.getPathsByTags?.(tags);
    expect(mockedTagCache.getPathsByTags).toHaveBeenCalledWith(["valid_tag"]);
  });

  it("should not call getPathsByTags if no tags are valid", async () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn,
    });
    const tags = ["invalid_tag"];
    await tagCache.getPathsByTags?.(tags);
    expect(mockedTagCache.getPathsByTags).not.toHaveBeenCalled();
  });

  it("should return the correct name", () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn,
    });

    expect(tagCache.name).toBe("filtered-mocked");
  });

  it("should not create a function if getPathsByTags is not defined", async () => {
    const tagCache = withFilter({
      tagCache: {
        ...mockedTagCache,
        getPathsByTags: undefined,
      },
      filterFn,
    });

    expect(tagCache.getPathsByTags).toBeUndefined();
  });

  it("should filter soft tags", () => {
    const tagCache = withFilter({
      tagCache: mockedTagCache,
      filterFn: softTagFilter,
    });

    tagCache.writeTags(["valid_tag", "_N_T_/", "_N_T_/test", "_N_T_/layout"]);
    expect(mockedTagCache.writeTags).toHaveBeenCalledWith(["valid_tag"]);
  });
});
