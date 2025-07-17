import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import type yargs from "yargs";

import { build as buildImpl } from "../build/build.js";
import { createOpenNextConfigIfNotExistent } from "../build/utils/create-config-files.js";
import { setupCLI, withWranglerOptions, withWranglerPassthroughArgs } from "./setup-cli.js";

async function buildCommand(args: {
	wranglerArgs: string[];
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

export function addBuildCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"build",
		"Build an OpenNext Cloudflare worker",
		(c) =>
			withWranglerOptions(c)
				.option("skipNextBuild", {
					type: "boolean",
					alias: ["skipBuild", "s"],
					default: ["1", "true", "yes"].includes(String(process.env.SKIP_NEXT_APP_BUILD)),
					desc: "Skip building the Next.js app",
				})
				.option("noMinify", {
					type: "boolean",
					default: false,
					desc: "Disable worker minification",
				})
				.option("skipWranglerConfigCheck", {
					type: "boolean",
					default: ["1", "true", "yes"].includes(String(process.env.SKIP_WRANGLER_CONFIG_CHECK)),
					desc: "Skip checking for a Wrangler config",
				}),
		(args) => buildCommand(withWranglerPassthroughArgs(args))
	);
}
