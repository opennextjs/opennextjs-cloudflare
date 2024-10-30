import { mkdirSync, type Stats, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

export function getArgs(): {
  skipNextBuild: boolean;
  outputDir?: string;
  minify: boolean;
} {
  const { skipBuild, output, noMinify } = parseArgs({
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
    },
    allowPositionals: false,
  }).values;

  const outputDir = output ? resolve(output) : undefined;

  if (outputDir) {
    assertDirArg(outputDir, "output", true);
  }

  return {
    outputDir,
    skipNextBuild: skipBuild || ["1", "true", "yes"].includes(String(process.env.SKIP_NEXT_APP_BUILD)),
    minify: !noMinify,
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
