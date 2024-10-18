import { cpSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectOptions } from "../config";
import { containsDotNextDir, getConfig } from "../config";
import { buildNextjsApp } from "./build-next-app";
import { buildWorker } from "./build-worker";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param projectOpts The options for the project
 */
export async function build(projectOpts: ProjectOptions): Promise<void> {
  if (!projectOpts.skipNextBuild) {
    // Build the next app
    await buildNextjsApp(projectOpts.sourceDir);
  }

  if (!containsDotNextDir(projectOpts.sourceDir)) {
    throw new Error(`.next folder not found in ${projectOpts.sourceDir}`);
  }

  // Clean the output directory
  await cleanDirectory(projectOpts.outputDir);

  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(join(projectOpts.sourceDir, ".next"), join(projectOpts.outputDir, ".next"), { recursive: true });

  const config = getConfig(projectOpts);

  await buildWorker(config);
}

async function cleanDirectory(path: string): Promise<void> {
  return await rm(path, { recursive: true, force: true });
}
