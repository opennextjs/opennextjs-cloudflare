import { containsDotNextDir, getConfig } from "../config";
import { buildNextjsApp } from "./build-next-app";
import { buildWorker } from "./build-worker";
import { cpSync } from "node:fs";
import path from "node:path";
import { rm } from "node:fs/promises";

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

  if (!containsDotNextDir(appDir)) {
    throw new Error(`.next folder not found in ${appDir}`);
  }

  // Create a clean output directory
  const outputDir = path.resolve(opts.outputDir ?? appDir, ".worker-next");
  await cleanDirectory(outputDir);

  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(path.join(appDir, ".next"), path.join(outputDir, ".next"), { recursive: true });

  const config = getConfig(appDir, outputDir);

  await buildWorker(config);
}

type BuildOptions = {
  skipBuild: boolean;
  outputDir?: string;
};

async function cleanDirectory(path: string): Promise<void> {
  return await rm(path, { recursive: true, force: true });
}
