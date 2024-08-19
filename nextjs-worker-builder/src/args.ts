import { existsSync, mkdirSync, type Stats, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

export async function getArgs(): Promise<{
  // inputNextAppDir: string;
  skipBuild?: boolean;
  outputDir?: string;
}> {
  const { values } = parseArgs({
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
    },
    allowPositionals: false,
  });

  const outputDir = values.output ? resolve(values.output) : undefined;

  if (outputDir) {
    assertDirArg(outputDir, "output", true);
  }

  return { outputDir, skipBuild: values.skipBuild };
}

function assertDirArg(path: string, argName?: string, make?: boolean) {
  let dirStats: Stats;
  try {
    dirStats = statSync(path);
  } catch {
    if (!make) {
      throw new Error(
        `Error: the provided${
          argName ? ` "${argName}"` : ""
        } input is not a valid path`
      );
    }
    mkdirSync(path);
    return;
  }

  if (!dirStats.isDirectory()) {
    throw new Error(
      `Error: the provided${
        argName ? ` "${argName}"` : ""
      } input is not a directory`
    );
  }
}
