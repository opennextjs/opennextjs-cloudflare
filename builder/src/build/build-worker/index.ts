import { NextjsAppPaths } from "../../nextjsPaths";
import { build, Plugin } from "esbuild";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";

import { resolve } from "node:path";

import { patchRequire } from "./patches/investigated/patchRequire";
import { patchUrl } from "./patches/investigated/patchUrl";

import { patchReadFile } from "./patches/to-investigate/patchReadFile";
import { patchFindDir } from "./patches/to-investigate/patchFindDir";
import { inlineNextRequire } from "./patches/to-investigate/inlineNextRequire";
import { inlineEvalManifest } from "./patches/to-investigate/inlineEvalManifest";

import * as url from "url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

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
	const repoRoot = resolve(`${__dirname}/../..`);

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
		plugins: [fixRequiresESBuildPlugin],
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
	const originalCode = await readFile(workerOutputFile, "utf8");

	let patchedCode = originalCode;

	patchedCode = patchRequire(patchedCode);
	patchedCode = patchReadFile(patchedCode, nextjsAppPaths);
	patchedCode = patchUrl(patchedCode);
	patchedCode = inlineNextRequire(patchedCode, nextjsAppPaths);
	patchedCode = patchFindDir(patchedCode, nextjsAppPaths);
	patchedCode = inlineEvalManifest(patchedCode, nextjsAppPaths);

	await writeFile(workerOutputFile, patchedCode);
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

const fixRequiresESBuildPlugin: Plugin = {
	name: "replaceRelative",
	setup(build) {
		// Note: we (empty) shim require-hook modules as they generate problematic code that uses requires
		build.onResolve({ filter: /^\.\/require-hook$/ }, (args) => ({
			path: `${__dirname}/templates/shims/empty.ts`,
		}));
	},
};
