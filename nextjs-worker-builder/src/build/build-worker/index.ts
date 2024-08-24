import { NextjsAppPaths } from "../../nextjsPaths";
import { build, Plugin } from "esbuild";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";

import { globSync } from "glob";
import { resolve } from "node:path";

let fixRequires: Plugin = {
	name: "replaceRelative",
	setup(build) {
		// Note: we (empty) shim require-hook modules as they generate problematic code that uses requires
		build.onResolve({ filter: /^\.\/require-hook$/ }, (args) => ({
			path: `${__dirname}/templates/shims/empty.ts`,
		}));
	},
};

/**
 * Using the Next.js build output in the `.next` directory builds a workerd compatible output
 *
 * @param outputDir the directory where to save the output
 * @param nextjsAppPaths
 */
export async function buildWorker(
	outputDir: string,
	nextjsAppPaths: NextjsAppPaths
): Promise<void> {
	console.log();

	const repoRoot = resolve(`${__dirname}/../..`);

	// ultra hack! to solve (maybe with Pete's help)
	const problematicUnenvFile = `${repoRoot}/node_modules/.pnpm/unenv-nightly@1.10.0-1717606461.a117952/node_modules/unenv-nightly/runtime/node/process/$cloudflare.mjs`;
	const originalProblematicUnenvFileContent = readFileSync(
		problematicUnenvFile,
		"utf-8"
	);
	writeFileSync(
		problematicUnenvFile,
		originalProblematicUnenvFileContent.replace(
			'const unpatchedGlobalThisProcess = globalThis["process"];',
			"const unpatchedGlobalThisProcess = global.process;"
		)
	);
	// ultra hack! to solve (maybe with Pete's help)
	// IMPORTANT: this is coming from the usage of the old school assets! we should not do that anyways!
	const problematicKvAssetHandler = `${repoRoot}/node_modules/.pnpm/@cloudflare+kv-asset-handler@0.3.4/node_modules/@cloudflare/kv-asset-handler/dist/index.js`;
	const originalProblematicKvAssetHandlerContent = readFileSync(
		problematicKvAssetHandler,
		"utf-8"
	);
	writeFileSync(
		problematicKvAssetHandler,
		originalProblematicKvAssetHandlerContent.replace(
			'const mime = __importStar(require("mime"));',
			'let mime = __importStar(require("mime")); mime = mime.default ?? mime;'
		)
	);

	const workerEntrypoint = `${__dirname}/templates/worker.ts`;
	const workerOutputFile = `${outputDir}/index.mjs`;
	const nextConfigStr =
		readFileSync(nextjsAppPaths.standaloneAppDir + "/server.js", "utf8")?.match(
			/const nextConfig = ({.+?})\n/
		)?.[1] ?? {};

	console.log(`\x1b[35m⚙️ Bundling the worker file...\n\x1b[0m`);
	await build({
		entryPoints: [workerEntrypoint],
		bundle: true,
		outfile: workerOutputFile,
		format: "esm",
		target: "esnext",
		minify: false,
		plugins: [fixRequires],
		alias: {
			// Note: we apply an empty shim to next/dist/compiled/ws because it generates two `eval`s:
			//   eval("require")("bufferutil");
			//   eval("require")("utf-8-validate");
			"next/dist/compiled/ws": `${__dirname}/templates/shims/empty.ts`,
			// Note: we apply an empty shim to next/dist/compiled/edge-runtime since (amongst others) it generated the following `eval`:
			//   eval(getModuleCode)(module, module.exports, throwingRequire, params.context, ...Object.values(params.scopedContext));
			//   which comes from https://github.com/vercel/edge-runtime/blob/6e96b55f/packages/primitives/src/primitives/load.js#L57-L63
			// QUESTION: Why did I encountered this but mhart didn't?
			"next/dist/compiled/edge-runtime": `${__dirname}/templates/shims/empty.ts`,
			// Note: we need to stub out `@opentelemetry/api` as that is problematic and doesn't get properly bundled...
			critters: `${__dirname}/templates/shims/empty.ts`,
			// Note: we need to stub out `@opentelemetry/api` as it is problematic
			// IMPORTANT: we shim @opentelemetry/api to the throwing shim so that it will throw right away, this is so that we throw inside the
			//            try block here: https://github.com/vercel/next.js/blob/9e8266a7/packages/next/src/server/lib/trace/tracer.ts#L27-L31
			//            causing the code to require the 'next/dist/compiled/@opentelemetry/api' module instead (which properly works)
			"@opentelemetry/api": `${__dirname}/templates/shims/throw.ts`,
			// `@next/env` is a library Next.js uses for loading dotenv files, for obvious reasons we need to stub it here
			// source: https://github.com/vercel/next.js/tree/0ac10d79720/packages/next-env
			"@next/env": `${__dirname}/templates/shims/env.ts`,
		},
		define: {
			// config file used by Next.js, see: https://github.com/vercel/next.js/blob/68a7128/packages/next/src/build/utils.ts#L2137-L2139
			"process.env.__NEXT_PRIVATE_STANDALONE_CONFIG":
				JSON.stringify(nextConfigStr),
			// Next.js tried to access __dirname so we need to define it
			__dirname: '""',
			// Note: we need the __non_webpack_require__ variable declared as it is used by next-server:
			// https://github.com/vercel/next.js/blob/be0c3283/packages/next/src/server/next-server.ts#L116-L119
			__non_webpack_require__: "require",
			// The next.js server can run in minimal mode: https://github.com/vercel/next.js/blob/aa90fe9bb/packages/next/src/server/base-server.ts#L510-L511
			// this avoids some extra (/problematic) `require` calls, such as here: https://github.com/vercel/next.js/blob/aa90fe9bb/packages/next/src/server/next-server.ts#L1259
			// that's wht we enable it
			"process.env.NEXT_PRIVATE_MINIMAL_MODE": "true",
			// Ask mhart if he can explain why the `define`s below are necessary
			"process.env.NEXT_RUNTIME": '"nodejs"',
			"process.env.NODE_ENV": '"production"',
			"process.env.NEXT_MINIMAL": "true",
		},
		// We need to set platform to node so that esbuild doesn't complain about the node imports
		platform: "node",
		banner: {
			js: `
				${
					/*
					`__dirname` is used by unbundled js files (which don't inherit the `__dirname` present in the `define` field)
					so we also need to set it on the global scope
					Note: this was hit in the `next/dist/compiled/@opentelemetry/api` module
				*/ ""
				}
				globalThis.__dirname ??= "";
				${
					/*
					Code in `next/dist/compiled/next-server/app-page.runtime.prod.js` makes use of `setImmediate` so we need to make sure that
					it is available.
					Note: this most likely won't be needed soon after the changes from https://github.com/cloudflare/workerd/pull/2506 get released
					 */ ""
				}
				globalThis.setImmediate ??= (c) => setTimeout(c, 0);
			`,
		},
	});

	await updateWorkerBundledCode(workerOutputFile, nextjsAppPaths);

	updateWebpackChunksFile(nextjsAppPaths);

	console.log(`\x1b[35m⚙️ Copying asset files...\n\x1b[0m`);
	await cp(`${nextjsAppPaths.dotNextDir}/static`, `${outputDir}/assets/_next`, {
		recursive: true,
	});

	console.log(`\x1b[35mWorker saved in \`${workerOutputFile}\` 🚀\n\x1b[0m`);
}

/**
 * This function applies string replacements on the bundled worker code necessary to get it to run in workerd
 *
 * Needless to say all the logic in this function is something we should avoid as much as possible!
 *
 * @param workerOutputFile
 * @param nextjsAppPaths
 */
async function updateWorkerBundledCode(
	workerOutputFile: string,
	nextjsAppPaths: NextjsAppPaths
): Promise<void> {
	const workerContents = await readFile(workerOutputFile, "utf8");

	// ultra hack (don't remember/know why it's needed)
	let updatedWorkerContents = workerContents
		.replace(/__require\d?\(/g, "require(")
		.replace(/__require\d?\./g, "require.");

	// The next-server code gets the buildId from the filesystem, resulting in a `[unenv] fs.readFileSync is not implemented yet!` error
	// so we add an early return to the `getBuildId` function so that the `readyFileSync` is never encountered
	// (source: https://github.com/vercel/next.js/blob/15aeb92efb34c09a36/packages/next/src/server/next-server.ts#L438-L451)
	// Note: we could/should probably just patch readFileSync here or something!
	updatedWorkerContents = updatedWorkerContents.replace(
		"getBuildId() {",
		`getBuildId() {
      return ${JSON.stringify(
				readFileSync(
					`${nextjsAppPaths.standaloneAppDotNextDir}/BUILD_ID`,
					"utf-8"
				)
			)};
    `
	);

	// Same as above, the next-server code loads the manifests with `readyFileSync` and we want to avoid that
	// (source: https://github.com/vercel/next.js/blob/15aeb92e/packages/next/src/server/load-manifest.ts#L34-L56)
	// Note: we could/should probably just patch readFileSync here or something!
	const manifestJsons = globSync(
		`${nextjsAppPaths.standaloneAppDotNextDir}/**/*-manifest.json`
	).map((file) => file.replace(nextjsAppPaths.standaloneAppDir + "/", ""));
	updatedWorkerContents = updatedWorkerContents.replace(
		/function loadManifest\((.+?), .+?\) {/,
		`$&
    ${manifestJsons
			.map(
				(manifestJson) => `
          if ($1.endsWith("${manifestJson}")) {
            return ${readFileSync(
							`${nextjsAppPaths.standaloneAppDir}/${manifestJson}`,
							"utf-8"
						)};
          }
        `
			)
			.join("\n")}
    throw new Error("Unknown loadManifest: " + $1);
    `
	);

	// Next.js tries to instantiate an https agent, so here we replace that with a simple http one (which we support)
	// source: https://github.com/vercel/next.js/blob/aa90fe9bb/packages/next/src/server/setup-http-agent-env.ts#L20
	updatedWorkerContents = updatedWorkerContents.replace(
		'var _https = require("https");',
		'var _https = require("http");'
	);

	// This solves the fact that the workerd URL parsing is not compatible with the node.js one
	// VERY IMPORTANT: this required the following dependency to be part of the application!!!! (this is very bad!!!)
	//    "node-url": "npm:url@^0.11.4"
	// Hopefully this should not be necessary after this unenv PR lands: https://github.com/unjs/unenv/pull/292
	updatedWorkerContents = updatedWorkerContents.replace(
		/ ([a-zA-Z0-9_]+) = require\("url"\);/g,
		` $1 = require("url");
      const nodeUrl = require("node-url");
      $1.parse = nodeUrl.parse.bind(nodeUrl);
      $1.format = nodeUrl.format.bind(nodeUrl);
      $1.pathToFileURL = (path) => {
        console.log("url.pathToFileURL", path);
        return new URL("file://" + path);
      }
    `
	);

	// The following avoid various Next.js specific files `require`d at runtime since we can just read
	// and inline their content during build time
	const pagesManifestFile = `${nextjsAppPaths.standaloneAppServerDir}/pages-manifest.json`;
	const appPathsManifestFile = `${nextjsAppPaths.standaloneAppServerDir}/app-paths-manifest.json`;

	const pagesManifestFiles = existsSync(pagesManifestFile)
		? Object.values(JSON.parse(readFileSync(pagesManifestFile, "utf-8"))).map(
				(file) => ".next/server/" + file
			)
		: [];
	const appPathsManifestFiles = existsSync(appPathsManifestFile)
		? Object.values(
				JSON.parse(readFileSync(appPathsManifestFile, "utf-8"))
			).map((file) => ".next/server/" + file)
		: [];
	const allManifestFiles = pagesManifestFiles.concat(appPathsManifestFiles);

	const htmlPages = allManifestFiles.filter((file) => file.endsWith(".html"));
	const pageModules = allManifestFiles.filter((file) => file.endsWith(".js"));

	updatedWorkerContents = updatedWorkerContents.replace(
		/const pagePath = getPagePath\(.+?\);/,
		`$&
    ${htmlPages
			.map(
				(htmlPage) => `
          if (pagePath.endsWith("${htmlPage}")) {
            return ${JSON.stringify(
							readFileSync(
								`${nextjsAppPaths.standaloneAppDir}/${htmlPage}`,
								"utf-8"
							)
						)};
          }
        `
			)
			.join("\n")}
    ${pageModules
			.map(
				(module) => `
          if (pagePath.endsWith("${module}")) {
            return require("${nextjsAppPaths.standaloneAppDir}/${module}");
          }
        `
			)
			.join("\n")}
    throw new Error("Unknown pagePath: " + pagePath);
    `
	);

	// Here we patch `findDir` so that the next server can detect whether the `app` or `pages` directory exists
	// (source: https://github.com/vercel/next.js/blob/ba995993/packages/next/src/lib/find-pages-dir.ts#L4-L13)
	// (usage source: https://github.com/vercel/next.js/blob/ba995993/packages/next/src/server/next-server.ts#L450-L451)
	// Note: `findDir` uses `fs.existsSync` under the hood, so patching that should be enough to make this work
	updatedWorkerContents = updatedWorkerContents.replace(
		"function findDir(dir, name) {",
		`function findDir(dir, name) {
			if (dir.endsWith(".next/server")) {
			if (name === "app") return ${existsSync(
				`${nextjsAppPaths.standaloneAppServerDir}/app`
			)};
			if (name === "pages") return ${existsSync(
				`${nextjsAppPaths.standaloneAppServerDir}/pages`
			)};
		}
		throw new Error("Unknown findDir call: " + dir + " " + name);
		`
	);

	// `evalManifest` relies on readFileSync so we need to patch the function so that it instead returns the content of the manifest files
	// which are known at build time
	// (source: https://github.com/vercel/next.js/blob/b1e32c5d1f/packages/next/src/server/load-manifest.ts#L72)
	// Note: we could/should probably just patch readFileSync here or something, but here the issue is that after the readFileSync call
	// there is a vm `runInNewContext` call which we also don't support (source: https://github.com/vercel/next.js/blob/b1e32c5d1f/packages/next/src/server/load-manifest.ts#L88)
	const manifestJss = globSync(
		`${nextjsAppPaths.standaloneAppDotNextDir}/**/*_client-reference-manifest.js`
	).map((file) => file.replace(`${nextjsAppPaths.standaloneAppDir}/`, ""));
	updatedWorkerContents = updatedWorkerContents.replace(
		/function evalManifest\((.+?), .+?\) {/,
		`$&
		${manifestJss
			.map(
				(manifestJs) => `
			  if ($1.endsWith("${manifestJs}")) {
				require("${nextjsAppPaths.standaloneAppDir}/${manifestJs}");
				return {
				  __RSC_MANIFEST: {
					"${manifestJs
						.replace(".next/server/app", "")
						.replace(
							"_client-reference-manifest.js",
							""
						)}": globalThis.__RSC_MANIFEST["${manifestJs
						.replace(".next/server/app", "")
						.replace("_client-reference-manifest.js", "")}"],
				  },
				};
			  }
			`
			)
			.join("\n")}
		throw new Error("Unknown evalManifest: " + $1);
		`
	);

	await writeFile(workerOutputFile, updatedWorkerContents);
}

/**
 * Fixes the webpack-runtime.js file by removing its webpack dynamic requires.
 *
 * This hack is especially bad for two reasons:
 *  - it requires setting `experimental.serverMinification` to `false` in the app's config file
 *  - indicates that files inside the output directory still get a hold of files from the outside: `${nextjsAppPaths.standaloneAppServerDir}/webpack-runtime.js`
 *    so this shows that not everything that's needed to deploy the application is in the output directory...
 */
async function updateWebpackChunksFile(nextjsAppPaths: NextjsAppPaths) {
	const webpackRuntimeFile = `${nextjsAppPaths.standaloneAppServerDir}/webpack-runtime.js`;

	const fileContent = readFileSync(webpackRuntimeFile, "utf-8");

	const chunks = readdirSync(`${nextjsAppPaths.standaloneAppServerDir}/chunks`)
		.filter((chunk) => /^\d+\.js$/.test(chunk))
		.map((chunk) => chunk.replace(/\.js$/, ""));

	const updatedFileContent = fileContent.replace(
		"__webpack_require__.f.require = (chunkId, promises) => {",
		`__webpack_require__.f.require = (chunkId, promises) => {
	if (installedChunks[chunkId]) return;
	${chunks
		.map(
			(chunk) => `
	  if (chunkId === ${chunk}) {
		installChunk(require("./chunks/${chunk}.js"));
		return;
	  }
	`
		)
		.join("\n")}
  `
	);

	writeFileSync(webpackRuntimeFile, updatedFileContent);
}
