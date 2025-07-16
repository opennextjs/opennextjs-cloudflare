import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";

import { build as buildImpl } from "../build/build.js";
import { createOpenNextConfigIfNotExistent } from "../build/utils/create-config-files.js";
import { setupCLI } from "./setup-cli.js";

export async function buildCommand(args: {
	passthrough: string[];
	config: string | undefined;
	env: string | undefined;
	skipNextBuild: boolean;
	noMinify: boolean;
	skipWranglerConfigCheck: boolean;
}) {
	const { options, config, wranglerConfig, baseDir } = await setupCLI("build", args, async (baseDir) => {
		await createOpenNextConfigIfNotExistent(baseDir);
		return compileOpenNextConfig(baseDir, undefined, { compileEdge: true });
	});

	return buildImpl(options, config, { ...args, minify: !args.noMinify, sourceDir: baseDir }, wranglerConfig);
}
