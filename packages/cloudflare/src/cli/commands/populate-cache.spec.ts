import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper";
import mockFs from "mock-fs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { getCacheAssets } from "./populate-cache";

describe("getCacheAssets", () => {
  beforeAll(() => {
    mockFs();

    const fetchBaseDir = "/base/path/cache/__fetch/buildID";
    const cacheDir = "/base/path/cache/buildID/path/to";

    mkdirSync(fetchBaseDir, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });

    for (let i = 0; i < 3; i++) {
      writeFileSync(path.join(fetchBaseDir, `${i}`), "", { encoding: "utf-8" });
      writeFileSync(path.join(cacheDir, `${i}.cache`), "", { encoding: "utf-8" });
    }
  });

  afterAll(() => mockFs.restore());

  test("list cache assets", () => {
    expect(getCacheAssets({ outputDir: "/base/path" } as BuildOptions)).toMatchInlineSnapshot(`
      [
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/2.cache",
          "isFetch": false,
          "key": "/path/to/2",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/1.cache",
          "isFetch": false,
          "key": "/path/to/1",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/0.cache",
          "isFetch": false,
          "key": "/path/to/0",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/2",
          "isFetch": true,
          "key": "/2",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/1",
          "isFetch": true,
          "key": "/1",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/0",
          "isFetch": true,
          "key": "/0",
        },
      ]
    `);
  });
});
