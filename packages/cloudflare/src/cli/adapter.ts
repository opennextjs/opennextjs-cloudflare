/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { compileCache } from "@opennextjs/aws/build/compileCache.js";
import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import { compileTagCacheProvider } from "@opennextjs/aws/build/compileTagCacheProvider.js";
import { createCacheAssets, createStaticAssets } from "@opennextjs/aws/build/createAssets.js";
import { createMiddleware } from "@opennextjs/aws/build/createMiddleware.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { addDebugFile } from "@opennextjs/aws/debug.js";
import type { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import { inlineRouteHandler } from "@opennextjs/aws/plugins/inlineRouteHandlers.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";

import { bundleServer } from "./build/bundle-server.js";
import { compileEnvFiles } from "./build/open-next/compile-env-files.js";
import { compileImages } from "./build/open-next/compile-images.js";
import { compileInit } from "./build/open-next/compile-init.js";
import { compileSkewProtection } from "./build/open-next/compile-skew-protection.js";
import { compileDurableObjects } from "./build/open-next/compileDurableObjects.js";
import { createServerBundle } from "./build/open-next/createServerBundle.js";
import { inlineLoadManifest } from "./build/patches/plugins/load-manifest.js";

export type NextAdapterOutputs = {
	pages: any[];
	pagesApi: any[];
	appPages: any[];
	appRoutes: any[];
};

export type BuildCompleteCtx = {
	routes: any;
	outputs: NextAdapterOutputs;
	projectDir: string;
	repoRoot: string;
	distDir: string;
	config: NextConfig;
	nextVersion: string;
};

type NextAdapter = {
	name: string;
	modifyConfig: (config: NextConfig, { phase }: { phase: string }) => Promise<NextConfig>;
	onBuildComplete: (ctx: BuildCompleteCtx) => Promise<void>;
}; //TODO: use the one provided by Next

let buildOpts: buildHelper.BuildOptions;

export default {
	name: "OpenNext",

	async modifyConfig(nextConfig) {
		// We have to precompile the cache here, probably compile OpenNext config as well
		const { config, buildDir } = await compileOpenNextConfig("open-next.config.ts", {
			// TODO(vicb): do we need edge compile
			compileEdge: true,
		});

		const require = createRequire(import.meta.url);
		const openNextDistDir = path.dirname(require.resolve("@opennextjs/aws/index.js"));

		buildOpts = buildHelper.normalizeOptions(config, openNextDistDir, buildDir);

		buildHelper.initOutputDir(buildOpts);

		const cache = compileCache(buildOpts);

		// We then have to copy the cache files to the .next dir so that they are available at runtime
		// TODO: use a better path, this one is temporary just to make it work
		const tempCachePath = `${buildOpts.outputDir}/server-functions/default/.open-next/.build`;
		fs.mkdirSync(tempCachePath, { recursive: true });
		fs.copyFileSync(cache.cache, path.join(tempCachePath, "cache.cjs"));
		fs.copyFileSync(cache.composableCache, path.join(tempCachePath, "composable-cache.cjs"));

		//TODO: We should check the version of Next here, below 16 we'd throw or show a warning
		return {
			...nextConfig,
			cacheHandler: cache.cache, //TODO: compute that here,
			cacheMaxMemorySize: 0,
			experimental: {
				...nextConfig.experimental,
				trustHostHeader: true,
				cacheHandlers: {
					default: cache.composableCache,
				},
			},
		};
	},

	async onBuildComplete(ctx: BuildCompleteCtx) {
		console.log("OpenNext build will start now");

		const configPath = path.join(buildOpts.appBuildOutputPath, ".open-next/.build/open-next.config.edge.mjs");
		if (!fs.existsSync(configPath)) {
			throw new Error("Could not find compiled Open Next config, did you run the build command?");
		}
		const openNextConfig = await import(configPath).then((mod) => mod.default);

		// TODO(vicb): save outputs
		addDebugFile(buildOpts, "outputs.json", ctx);

		// Cloudflare specific
		compileEnvFiles(buildOpts);
		/* TODO(vicb): pass the wrangler config*/
		await compileInit(buildOpts, {} as any);
		await compileImages(buildOpts);
		await compileSkewProtection(buildOpts, openNextConfig);

		// Compile middleware
		// TODO(vicb): `forceOnlyBuildOnce` is cloudflare specific
		await createMiddleware(buildOpts, { forceOnlyBuildOnce: true });
		console.log("Middleware created");

		createStaticAssets(buildOpts);
		console.log("Static assets created");

		if (buildOpts.config.dangerous?.disableIncrementalCache !== true) {
			const { useTagCache } = createCacheAssets(buildOpts);
			console.log("Cache assets created");
			if (useTagCache) {
				await compileTagCacheProvider(buildOpts);
				console.log("Tag cache provider compiled");
			}
		}

		await createServerBundle(
			buildOpts,
			{
				additionalPlugins: getAdditionalPluginsFactory(buildOpts, ctx),
			},
			ctx
		);

		await compileDurableObjects(buildOpts);

		// TODO(vicb): pass minify `projectOpts`
		await bundleServer(buildOpts, { minify: false } as any);

		console.log("OpenNext build complete.");

		// TODO(vicb): not needed on cloudflare
		// console.log("Server bundle created");
		// await createRevalidationBundle(buildOpts);
		// console.log("Revalidation bundle created");
		// await createImageOptimizationBundle(buildOpts);
		// console.log("Image optimization bundle created");
		// await createWarmerBundle(buildOpts);
		// console.log("Warmer bundle created");
		// await generateOutput(buildOpts);
		// console.log("Output generated");
	},
} satisfies NextAdapter;

function getAdditionalPluginsFactory(buildOpts: buildHelper.BuildOptions, ctx: BuildCompleteCtx) {
	return (updater: ContentUpdater) => [
		inlineRouteHandler(updater, ctx.outputs),
		//externalChunksPlugin(outputs),
		inlineLoadManifest(updater, buildOpts),
	];
}
