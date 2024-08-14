import { existsSync, type Stats, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

export async function getArgs(): Promise<{
  inputNextAppDir: string;
  skipBuild?: boolean;
  outputDir?: string;
}> {
  const { positionals, values } = parseArgs({
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
    allowPositionals: true,
  });

  if (positionals.length !== 1) {
    throw new Error(
      "Please provide a single positional argument indicating the Next.js app directory"
    );
  }

  const inputNextAppDir = resolve(positionals[0]);

  assertDirArg(inputNextAppDir);

  // equivalent do: https://github.com/sst/open-next/blob/f61b0e94/packages/open-next/src/build.ts#L130-L141
  if (
    !["js", "cjs", "mjs", "ts"].some((ext) =>
      existsSync(`${inputNextAppDir}/next.config.${ext}`)
    )
  ) {
    throw new Error(
      "Error: the directory doesn't seem to point to a Next.js app"
    );
  }

  const outputDir = values.output ? resolve(values.output) : undefined;

  if (outputDir) {
    assertDirArg(outputDir, "output");
  }

  return { inputNextAppDir, outputDir, skipBuild: values.skipBuild };
}

function assertDirArg(path: string, argName?: string) {
  let dirStats: Stats;
  try {
    dirStats = statSync(path);
  } catch {
    throw new Error(
      `Error: the provided${
        argName ? ` "${argName}"` : ""
      } input is not a valid path`
    );
  }

  if (!dirStats.isDirectory()) {
    throw new Error(
      `Error: the provided${
        argName ? ` "${argName}"` : ""
      } input is not a directory`
    );
  }
}
