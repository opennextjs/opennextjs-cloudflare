import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { buildNextjsApp, setStandaloneBuildMode } from "@opennextjs/aws/build/buildNextApp.js";
import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import { createStaticAssets } from "@opennextjs/aws/build/createAssets.js";
import { createMiddleware } from "@opennextjs/aws/build/createMiddleware.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { printHeader, showWarningOnWindows } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import type { ProjectOptions } from "../config";
import { containsDotNextDir, getConfig } from "../config";
import { buildWorker } from "./build-worker";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param projectOpts The options for the project
 */
export async function build(projectOpts: ProjectOptions): Promise<void> {
  printHeader("Cloudflare build");

  showWarningOnWindows();

  const baseDir = projectOpts.sourceDir;
  const require = createRequire(import.meta.url);
  const openNextDistDir = dirname(require.resolve("@opennextjs/aws/index.js"));

  const { config, buildDir } = await compileOpenNextConfig(baseDir);

  ensureCloudflareConfig(config);

  // Initialize options
  const options = buildHelper.normalizeOptions(config, openNextDistDir, buildDir);
  logger.setLevel(options.debug ? "debug" : "info");

  // Pre-build validation
  buildHelper.checkRunningInsideNextjsApp(options);
  logger.info(`App directory: ${options.appPath}`);
  buildHelper.printNextjsVersion(options);
  buildHelper.printOpenNextVersion(options);

  if (projectOpts.skipNextBuild) {
    logger.warn("Skipping Next.js build");
  } else {
    // Build the next app
    printHeader("Building Next.js app");
    setStandaloneBuildMode(options);
    buildNextjsApp(options);
  }

  if (!containsDotNextDir(projectOpts.sourceDir)) {
    throw new Error(`.next folder not found in ${projectOpts.sourceDir}`);
  }

  // Generate deployable bundle
  printHeader("Generating bundle");
  buildHelper.initOutputDir(options);

  // Compile middleware
  await createMiddleware(options, { forceOnlyBuildOnce: true });

  createStaticAssets(options);

  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(join(projectOpts.sourceDir, ".next"), join(projectOpts.outputDir, ".next"), { recursive: true });

  const projConfig = getConfig(projectOpts);

  await buildWorker(projConfig);

  logger.info("OpenNext build complete.");
}

/**
 * Ensures open next is configured for cloudflare.
 *
 * @param config OpenNext configuration.
 */
function ensureCloudflareConfig(config: OpenNextConfig) {
  const requirements = {
    isExternal: config.middleware?.external == true,
    useCloudflareWrapper: config.middleware?.override?.wrapper === "cloudflare",
    useEdgeConverter: config.middleware?.override?.converter === "edge",
    disableCacheInterception: config.dangerous?.enableCacheInterception !== true,
  };

  if (Object.values(requirements).some((satisfied) => !satisfied)) {
    throw new Error(`open-next.config.ts should contain:
{
  "middleware": {
    "external": true,
    "override": {
      "wrapper": "cloudflare",
      "converter": "edge"
    }
  },
  "dangerous": {
    "enableCacheInterception": false
  }
}`);
  }
}
