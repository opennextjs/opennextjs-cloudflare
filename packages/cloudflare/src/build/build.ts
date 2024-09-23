import { rm } from "node:fs/promises";
import { buildNextjsApp } from "./build-next-app";
import { buildWorker } from "./build-worker";
import { getNextjsAppPaths } from "../nextjs-paths";
import { cpSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param appDir the directory of the Next.js app to build
 * @param opts.outputDir the directory where to save the output (defaults to the app's directory)
 * @param opts.skipBuild boolean indicating whether the Next.js build should be skipped (i.e. if the `.next` dir is already built)
 */
export async function build(appDir: string, opts: BuildOptions): Promise<void> {
  if (!opts.skipBuild) {
    // Build the next app
    buildNextjsApp(appDir);
  }

  // Create a clean output directory
  const outputDir = resolve(opts.outputDir ?? appDir, ".worker-next");
  await cleanDirectory(outputDir);

  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(resolve(`${appDir}/.next`), resolve(`${outputDir}/.next`), { recursive: true });
  const nextjsAppPaths = getNextjsAppPaths(outputDir);

  await buildWorker(appDir, outputDir, nextjsAppPaths);
}

type BuildOptions = {
  skipBuild: boolean;
  outputDir?: string;
};

async function cleanDirectory(path: string): Promise<void> {
  return await rm(path, { recursive: true, force: true });
}
