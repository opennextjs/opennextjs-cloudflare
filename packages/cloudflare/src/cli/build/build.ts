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
import { ensureNextjsVersionSupported } from "../utils/nextjs-support.js";
import { bundleServer } from "./bundle-server.js";
import { bundleNodeMiddleware } from "./open-next/bundle-node-middleware.js";
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
	wranglerConfig: Unstable_Config,
	allowUnsupportedNextVersions: boolean
): Promise<void> {
	// Do not minify the code so that we can apply string replacement patch.
	options.minify = false;

	// Pre-build validation
	buildHelper.checkRunningInsideNextjsApp(options);
	logger.info(`App directory: ${options.appPath}`);
	buildHelper.printNextjsVersion(options);
	await ensureNextjsVersionSupported(options);
	buildHelper.checkNextVersionSupport(
		options.nextVersion,
		allowUnsupportedNextVersions,
		`--dangerouslyUseUnsupportedNextVersion`
	);
	const { aws, cloudflare } = getVersion();
	logger.info(`@opennextjs/cloudflare version: ${cloudflare}`);
	logger.info(`@opennextjs/aws version: ${aws}`);
	if (wranglerConfig.compatibility_date) {
		const sixMonthsAgoMs = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
		const compatDateMs = new Date(wranglerConfig.compatibility_date).getTime();
		if (!isNaN(compatDateMs)) {
			const dateMessage = `workerd compatibility_date: ${wranglerConfig.compatibility_date}`;
			if (compatDateMs < sixMonthsAgoMs) {
				logger.warn(
					`${dateMessage}, consider updating your wrangler config to a more recent date to benefit from the latest features and fixes.`
				);
			} else {
				logger.info(`${dateMessage}`);
			}
		}
	}

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

	const hasNodeMiddleware = useNodeMiddleware(options);
	if (hasNodeMiddleware) {
		logger.warn(
			"Node.js middleware support is experimental, make sure that `nodejs_compat` is enabled in your wrangler configuration."
		);
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

	if (hasNodeMiddleware) {
		await bundleNodeMiddleware(options);
	}

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
