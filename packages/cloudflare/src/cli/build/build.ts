import { buildNextjsApp, setStandaloneBuildMode } from "@opennextjs/aws/build/buildNextApp.js";
import { compileCache } from "@opennextjs/aws/build/compileCache.js";
import { createCacheAssets, createStaticAssets } from "@opennextjs/aws/build/createAssets.js";
import { createMiddleware } from "@opennextjs/aws/build/createMiddleware.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { patchOriginalNextConfig } from "@opennextjs/aws/build/patch/patches/index.js";
import { printHeader } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import type { Unstable_Config } from "wrangler";

import { OpenNextConfig } from "../../api/config.js";
import type { ProjectOptions } from "../project-options.js";
import { bundleServer } from "./bundle-server.js";
import { compileCacheAssetsManifestSqlFile } from "./open-next/compile-cache-assets-manifest.js";
import { compileEnvFiles } from "./open-next/compile-env-files.js";
import { compileImages } from "./open-next/compile-images.js";
import { compileInit } from "./open-next/compile-init.js";
import { compileSkewProtection } from "./open-next/compile-skew-protection.js";
import { compileDurableObjects } from "./open-next/compileDurableObjects.js";
import { createServerBundle } from "./open-next/createServerBundle.js";
import { useNodeMiddleware } from "./utils/middleware.js";
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
	options: buildHelper.BuildOptions,
	config: OpenNextConfig,
	projectOpts: ProjectOptions,
	wranglerConfig: Unstable_Config
): Promise<void> {
	// Do not minify the code so that we can apply string replacement patch.
	options.minify = false;

	// Pre-build validation
	buildHelper.checkRunningInsideNextjsApp(options);
	logger.info(`App directory: ${options.appPath}`);
	buildHelper.printNextjsVersion(options);
	await ensureNextjsVersionSupported(options);
	const { aws, cloudflare } = getVersion();
	logger.info(`@opennextjs/cloudflare version: ${cloudflare}`);
	logger.info(`@opennextjs/aws version: ${aws}`);

	// Clean the output directory before building the Next app.
	buildHelper.initOutputDir(options);

	if (projectOpts.skipNextBuild) {
		logger.warn("Skipping Next.js build");
	} else {
		// Build the next app
		printHeader("Building Next.js app");
		setStandaloneBuildMode(options);
		buildNextjsApp(options);
	}

	// Make sure no Node.js middleware is used
	if (useNodeMiddleware(options)) {
		logger.error("Node.js middleware is not currently supported. Consider switching to Edge Middleware.");
		process.exit(1);
	}

	// Generate deployable bundle
	printHeader("Generating bundle");

	await patchOriginalNextConfig(options);

	compileCache(options);
	compileEnvFiles(options);
	await compileInit(options, wranglerConfig);
	await compileImages(options);
	await compileSkewProtection(options, config);

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

	await bundleServer(options, projectOpts);

	logger.info("OpenNext build complete.");
}

async function ensureNextjsVersionSupported({ nextVersion }: buildHelper.BuildOptions) {
	if (buildHelper.compareSemver(nextVersion, "<", "14.2.0")) {
		logger.error("Next.js version unsupported, please upgrade to version 14.2 or greater.");
		process.exit(1);
	}

	const {
		default: { version: wranglerVersion },
	} = await import("wrangler/package.json", { with: { type: "json" } });

	// We need a version of workerd that has a fix for setImmediate for Next.js 16.1+
	// See:
	// - https://github.com/cloudflare/workerd/pull/5869
	// - https://github.com/opennextjs/opennextjs-cloudflare/issues/1049
	if (
		buildHelper.compareSemver(nextVersion, ">=", "16.1.0") &&
		buildHelper.compareSemver(wranglerVersion, "<", "4.59.2")
	) {
		logger.warn(`Next.js 16.1+ requires wrangler 4.59.2 or greater (${wranglerVersion} detected).`);
	}
}
