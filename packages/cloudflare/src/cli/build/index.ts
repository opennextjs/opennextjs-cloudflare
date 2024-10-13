import type { Config } from "../config";
import { buildNextjsApp } from "./build-next-app";
import { buildWorker } from "./build-worker";
import { containsDotNextDir } from "../config";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { rm } from "node:fs/promises";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param config Build config
 */
export async function build(config: Config): Promise<void> {
  if (!config.build.skipNextBuild) {
    // Build the next app
    await buildNextjsApp(config.paths.source.root);
  }

  if (!containsDotNextDir(config.paths.source.root)) {
    throw new Error(`.next folder not found in ${config.paths.source.root}`);
  }

  // Clean the output directory
  await cleanDirectory(config.paths.output.root);

  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(join(config.paths.source.root, ".next"), join(config.paths.output.root, ".next"), {
    recursive: true,
  });

  await buildWorker(config);
}

async function cleanDirectory(path: string): Promise<void> {
  return await rm(path, { recursive: true, force: true });
}
