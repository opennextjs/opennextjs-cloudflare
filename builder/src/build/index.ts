import { rm } from "node:fs/promises";
import { buildNextjsApp } from "./build-next-app";
import { buildWorker } from "./build-worker";
import { getNextjsAppPaths } from "../nextjsPaths";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param inputNextAppDir the directory of the Next.js app to build
 * @param opts.outputDir the directory where to save the output (defaults to the app's directory)
 * @param opts.skipBuild boolean indicating whether the Next.js build should be skipped (i.e. if the `.next` dir is already built)
 */
export async function build(
	inputNextAppDir: string,
	opts: BuildOptions
): Promise<void> {
	if (!opts.skipBuild) {
		buildNextjsApp(inputNextAppDir);
	}

	const outputDir = `${opts.outputDir ?? inputNextAppDir}/.worker-next`;
	cleanDirectory(outputDir);

	const nextjsAppPaths = getNextjsAppPaths(inputNextAppDir);
	await buildWorker(outputDir, nextjsAppPaths);
}

type BuildOptions = {
	skipBuild: boolean;
	outputDir?: string;
};

async function cleanDirectory(path: string): Promise<void> {
	return await rm(path, { recursive: true, force: true });
}
