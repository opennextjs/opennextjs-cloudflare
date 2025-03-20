import { mkdirSync, type Stats, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { isWranglerTarget, WranglerTarget } from "./utils/run-wrangler";

export type Arguments = (
  | {
      command: "build";
      skipNextBuild: boolean;
      skipWranglerConfigCheck: boolean;
      minify: boolean;
    }
  | { command: "preview" | "deploy" }
  | { command: "populateCache"; target: WranglerTarget }
) & { outputDir?: string };

export function getArgs(): Arguments {
  const { positionals, values } = parseArgs({
    options: {
      skipBuild: { type: "boolean", short: "s", default: false },
      output: { type: "string", short: "o" },
      noMinify: { type: "boolean", default: false },
      skipWranglerConfigCheck: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const outputDir = values.output ? resolve(values.output) : undefined;
  if (outputDir) assertDirArg(outputDir, "output", true);

  switch (positionals[0]) {
    case "build":
      return {
        command: "build",
        outputDir,
        skipNextBuild:
          values.skipBuild || ["1", "true", "yes"].includes(String(process.env.SKIP_NEXT_APP_BUILD)),
        skipWranglerConfigCheck:
          values.skipWranglerConfigCheck ||
          ["1", "true", "yes"].includes(String(process.env.SKIP_WRANGLER_CONFIG_CHECK)),
        minify: !values.noMinify,
      };
    case "preview":
      return { command: "preview", outputDir };
    case "deploy":
      return { command: "preview", outputDir };
    case "populateCache":
      if (!isWranglerTarget(positionals[1])) {
        throw new Error(`Error: invalid target for populating the cache, expected 'local' | 'remote'`);
      }
      return { command: "populateCache", outputDir, target: positionals[1] };
    default:
      throw new Error("Error: invalid command, expected 'build' | 'preview' | 'deploy' | 'populateCache'");
  }
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
