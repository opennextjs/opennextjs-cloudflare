import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

export async function getArgs(): Promise<{
  inputNextAppDir: string;
}> {
  const { positionals } = parseArgs({
    options: {},
    allowPositionals: true,
  });

  if (positionals.length !== 1) {
    throw new Error(
      "Please provide a single positional argument indicating the Next.js app directory"
    );
  }

  const inputNextAppDir = resolve(positionals[0]);

  const inputNextAppDirStat = await stat(inputNextAppDir).catch(() => {
    throw new Error("Error: the provided input is not a valid path");
  });

  if (!inputNextAppDirStat.isDirectory()) {
    throw new Error("Error: the provided input is not a directory");
  }

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

  return { inputNextAppDir };
}
