import { buildNextjsApp, setStandaloneBuildMode } from "@opennextjs/aws/build/buildNextApp.js";
import { compileCache } from "@opennextjs/aws/build/compileCache.js";
import { createCacheAssets, createStaticAssets } from "@opennextjs/aws/build/createAssets.js";
import { createMiddleware } from "@opennextjs/aws/build/createMiddleware.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { printHeader } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import type { ProjectOptions } from "../project-options.js";
import { bundleServer } from "./bundle-server.js";
import { compileCacheAssetsManifestSqlFile } from "./open-next/compile-cache-assets-manifest.js";
import { compileEnvFiles } from "./open-next/compile-env-files.js";
import { compileInit } from "./open-next/compile-init.js";
import { compileDurableObjects } from "./open-next/compileDurableObjects.js";
import { createServerBundle } from "./open-next/createServerBundle.js";
import { createWranglerConfigIfNotExistent } from "./utils/index.js";
import { getVersion } from "./utils/version.js";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param options The OpenNext options
 * @param config The OpenNext config
 * @param projectOpts The options for the project
 */
export async function build(
  options: BuildOptions,
  config: OpenNextConfig,
  projectOpts: ProjectOptions
): Promise<void> {
  // Do not minify the code so that we can apply string replacement patch.
  // Note that wrangler will still minify the bundle.
  options.minify = false;

  // Pre-build validation
  buildHelper.checkRunningInsideNextjsApp(options);
  logger.info(`App directory: ${options.appPath}`);
  buildHelper.printNextjsVersion(options);
  ensureNextjsVersionSupported(options);
  const { aws, cloudflare } = getVersion();
  logger.info(`@opennextjs/cloudflare version: ${cloudflare}`);
  logger.info(`@opennextjs/aws version: ${aws}`);

  if (projectOpts.skipNextBuild) {
    logger.warn("Skipping Next.js build");
  } else {
    // Build the next app
    printHeader("Building Next.js app");
    setStandaloneBuildMode(options);
    buildNextjsApp(options);
  }

  // Generate deployable bundle
  printHeader("Generating bundle");
  buildHelper.initOutputDir(options);

  // Compile cache.ts
  compileCache(options);

  // Compile .env files
  compileEnvFiles(options);

  // Compile workerd init
  compileInit(options);

  // Compile middleware
  await createMiddleware(options, { forceOnlyBuildOnce: true });

  createStaticAssets(options, { useBasePath: true });

  if (config.dangerous?.disableIncrementalCache !== true) {
    const { useTagCache, metaFiles } = createCacheAssets(options);

    if (useTagCache) {
      compileCacheAssetsManifestSqlFile(options, metaFiles);
    }
  }

  await createServerBundle(options);

  await compileDurableObjects(options);

  await bundleServer(options);

  if (!projectOpts.skipWranglerConfigCheck) {
    await createWranglerConfigIfNotExistent(projectOpts);
  }

  logger.info("OpenNext build complete.");
}

function ensureNextjsVersionSupported(options: buildHelper.BuildOptions) {
  if (buildHelper.compareSemver(options.nextVersion, "<", "14.2.0")) {
    logger.error("Next.js version unsupported, please upgrade to version 14.2 or greater.");
    process.exit(1);
  }
}
