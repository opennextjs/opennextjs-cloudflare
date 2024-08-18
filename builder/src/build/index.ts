import { rmSync, statSync } from "node:fs";
import { buildNextjsApp } from "./build-next-app";
import { buildWorker } from "./build-worker";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param inputNextAppDir the directory of the Next.js app to build
 * @param opts.outputDir the directory where to save the output (defaults to the app's directory)
 * @param opts.skipBuild boolean indicating whether the Next.js build should be skipped (i.e. if the `.next` dir is already built)
 */
export async function build(
  inputNextAppDir: string,
  opts: BuildOptions
): Promise<void> {
  const outputDir = `${opts.outputDir ?? inputNextAppDir}/.worker-next`;

  if (!opts.skipBuild) {
    buildNextjsApp(inputNextAppDir);
  }

  rmSync(outputDir, { recursive: true, force: true });

  const dotNextDir = getDotNextDirPath(inputNextAppDir);
  await buildWorker(dotNextDir, outputDir);
}

type BuildOptions = {
  skipBuild: boolean;
  outputDir?: string;
};

function getDotNextDirPath(nextAppDir: string): string {
  const dotNextDirPath = `${nextAppDir}/.next`;

  try {
    const dirStats = statSync(dotNextDirPath);
    if (!dirStats.isDirectory()) throw new Error();
  } catch {
    throw new Error(`Error: \`.next\` directory not found!`);
  }

  return dotNextDirPath;
}
