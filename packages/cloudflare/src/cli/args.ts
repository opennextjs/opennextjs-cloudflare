import { mkdirSync, type Stats, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { CacheBindingMode } from "./build/utils/index.js";
import { isCacheBindingMode } from "./build/utils/index.js";

export function getArgs(): {
  skipNextBuild: boolean;
  skipWranglerConfigCheck: boolean;
  outputDir?: string;
  minify: boolean;
  populateCache?: { mode: CacheBindingMode; onlyPopulateWithoutBuilding: boolean };
} {
  const { skipBuild, skipWranglerConfigCheck, output, noMinify, populateCache, onlyPopulateCache } =
    parseArgs({
      options: {
        skipBuild: {
          type: "boolean",
          short: "s",
          default: false,
        },
        output: {
          type: "string",
          short: "o",
        },
        noMinify: {
          type: "boolean",
          default: false,
        },
        skipWranglerConfigCheck: {
          type: "boolean",
          default: false,
        },
        populateCache: {
          type: "string",
        },
        onlyPopulateCache: {
          type: "boolean",
          default: false,
        },
      },
      allowPositionals: false,
    }).values;

  const outputDir = output ? resolve(output) : undefined;

  if (outputDir) {
    assertDirArg(outputDir, "output", true);
  }

  if (
    (populateCache !== undefined || onlyPopulateCache) &&
    (!populateCache?.length || !isCacheBindingMode(populateCache))
  ) {
    throw new Error(`Error: missing mode for populate cache flag, expected 'local' | 'remote'`);
  }

  return {
    outputDir,
    skipNextBuild: skipBuild || ["1", "true", "yes"].includes(String(process.env.SKIP_NEXT_APP_BUILD)),
    skipWranglerConfigCheck:
      skipWranglerConfigCheck ||
      ["1", "true", "yes"].includes(String(process.env.SKIP_WRANGLER_CONFIG_CHECK)),
    minify: !noMinify,
    populateCache: populateCache
      ? { mode: populateCache, onlyPopulateWithoutBuilding: !!onlyPopulateCache }
      : undefined,
  };
}

function assertDirArg(path: string, argName?: string, make?: boolean) {
  let dirStats: Stats;
  try {
    dirStats = statSync(path);
  } catch {
    if (!make) {
      throw new Error(`Error: the provided${argName ? ` "${argName}"` : ""} input is not a valid path`);
    }
    mkdirSync(path);
    return;
  }

  if (!dirStats.isDirectory()) {
    throw new Error(`Error: the provided${argName ? ` "${argName}"` : ""} input is not a directory`);
  }
}
