import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { buildNextjsApp, setStandaloneBuildMode } from "@opennextjs/aws/build/buildNextApp.js";
import { compileCache } from "@opennextjs/aws/build/compileCache.js";
import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import { createCacheAssets, createStaticAssets } from "@opennextjs/aws/build/createAssets.js";
import { createMiddleware } from "@opennextjs/aws/build/createMiddleware.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { printHeader, showWarningOnWindows } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";

import type { ProjectOptions } from "../config.js";
import { containsDotNextDir, getConfig } from "../config.js";
import { bundleServer } from "./bundle-server.js";
import { compileEnvFiles } from "./open-next/compile-env-files.js";
import { copyCacheAssets } from "./open-next/copyCacheAssets.js";
import { createServerBundle } from "./open-next/createServerBundle.js";
import {
  createOpenNextConfigIfNotExistent,
  createWranglerConfigIfNotExistent,
  ensureCloudflareConfig,
} from "./utils/index.js";

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

  await createOpenNextConfigIfNotExistent(projectOpts);

  const { config, buildDir } = await compileOpenNextConfig(baseDir);

  ensureCloudflareConfig(config);

  // Initialize options
  const options = buildHelper.normalizeOptions(config, openNextDistDir, buildDir);
  logger.setLevel(options.debug ? "debug" : "info");

  // Do not minify the code so that we can apply string replacement patch.
  // Note that wrangler will still minify the bundle.
  options.minify = false;

  // Pre-build validation
  buildHelper.checkRunningInsideNextjsApp(options);
  logger.info(`App directory: ${options.appPath}`);
  buildHelper.printNextjsVersion(options);
  ensureNextjsVersionSupported(options);
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

  // Compile cache.ts
  compileCache(options);

  // Compile .env files
  compileEnvFiles(options);

  // Compile middleware
  await createMiddleware(options, { forceOnlyBuildOnce: true });

  createStaticAssets(options);

  if (config.dangerous?.disableIncrementalCache !== true) {
    createCacheAssets(options);
    copyCacheAssets(options);
  }

  await createServerBundle(options);

  // TODO: drop this copy.
  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(join(projectOpts.sourceDir, ".next"), join(projectOpts.outputDir, ".next"), { recursive: true });

  const projConfig = getConfig(projectOpts);

  // TODO: rely on options only.
  await bundleServer(projConfig, options);

  if (!projectOpts.skipWranglerConfigCheck) {
    await createWranglerConfigIfNotExistent(projectOpts);
  }

  logger.info("OpenNext build complete.");
}

function ensureNextjsVersionSupported(options: buildHelper.BuildOptions) {
  if (buildHelper.compareSemver(options.nextVersion, "14.0.0") < 0) {
    logger.error("Next.js version unsupported, please upgrade to version 14 or greater.");
    process.exit(1);
  }
}
