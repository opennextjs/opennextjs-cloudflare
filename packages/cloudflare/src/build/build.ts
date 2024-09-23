import { rm } from "node:fs/promises";
import { buildNextjsApp } from "./build-next-app";
import { buildWorker } from "./build-worker";
import { getNextjsAppPaths } from "../nextjs-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, rmSync } from "node:fs";

const SAVE_DIR = ".save.next";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param inputNextAppDir the directory of the Next.js app to build
 * @param opts.outputDir the directory where to save the output (defaults to the app's directory)
 * @param opts.skipBuild boolean indicating whether the Next.js build should be skipped (i.e. if the `.next` dir is already built)
 */
export async function build(inputNextAppDir: string, opts: BuildOptions): Promise<void> {
  if (!opts.skipBuild) {
    // Build the next app and save a copy in .save.next
    buildNextjsApp(inputNextAppDir);
    rmSync(`${inputNextAppDir}/${SAVE_DIR}`, {
      recursive: true,
      force: true,
    });
    cpSync(`${inputNextAppDir}/.next`, `${inputNextAppDir}/${SAVE_DIR}`, {
      recursive: true,
    });
  } else {
    // Skip the next build and restore the copy from .next.save
    rmSync(`${inputNextAppDir}/.next`, { recursive: true, force: true });
    cpSync(`${inputNextAppDir}/${SAVE_DIR}`, `${inputNextAppDir}/.next`, {
      recursive: true,
    });
  }

  const outputDir = `${opts.outputDir ?? inputNextAppDir}/.worker-next`;
  await cleanDirectory(outputDir);

  const nextjsAppPaths = getNextjsAppPaths(inputNextAppDir);

  const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

  await buildWorker(outputDir, nextjsAppPaths, templateDir);
}

type BuildOptions = {
  skipBuild: boolean;
  outputDir?: string;
};

async function cleanDirectory(path: string): Promise<void> {
  return await rm(path, { recursive: true, force: true });
}
