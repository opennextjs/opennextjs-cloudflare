import yargs from "yargs";

import { buildCommand } from "./commands/build.js";
import { deployCommand } from "./commands/deploy.js";
import { populateCacheCommand } from "./commands/populate-cache.js";
import { previewCommand } from "./commands/preview.js";
import { uploadCommand } from "./commands/upload.js";

export function runCommand() {
	return yargs(process.argv.slice(2))
		.scriptName("opennextjs-cloudflare")
		.parserConfiguration({ "unknown-options-as-args": true })
		.command(
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
		)
		.command(
			"preview",
			"Preview a built OpenNext app with a Wrangler dev server",
			(c) => withPopulateCacheOptions(c),
			(args) => previewCommand(withWranglerPassthroughArgs(args))
		)
		.command(
			"deploy",
			"Deploy a built OpenNext app to Cloudflare Workers",
			(c) => withPopulateCacheOptions(c),
			(args) => deployCommand(withWranglerPassthroughArgs(args))
		)
		.command(
			"upload",
			"Upload a built OpenNext app to Cloudflare Workers",
			(c) => withPopulateCacheOptions(c),
			(args) => uploadCommand(withWranglerPassthroughArgs(args))
		)
		.command("populateCache", "Populate the cache for a built Next.js app", (c) =>
			c
				.command(
					"local",
					"Local dev server cache",
					(c) => withPopulateCacheOptions(c),
					(args) => populateCacheCommand("local", withWranglerPassthroughArgs(args))
				)
				.command(
					"remote",
					"Remote Cloudflare Worker cache",
					(c) => withPopulateCacheOptions(c),
					(args) => populateCacheCommand("remote", withWranglerPassthroughArgs(args))
				)
				.demandCommand(1, 1)
		)
		.demandCommand(1, 1)
		.parse();
}

function withWranglerOptions<T extends yargs.Argv>(args: T) {
	return args
		.options("config", {
			type: "string",
			alias: "c",
			desc: "Path to Wrangler configuration file",
		})
		.options("env", {
			type: "string",
			alias: "e",
			desc: "Wrangler environment to use for operations",
		});
}

function withPopulateCacheOptions<T extends yargs.Argv>(args: T) {
	return withWranglerOptions(args).options("cacheChunkSize", {
		type: "number",
		default: 25,
		desc: "Number of entries per chunk when populating the cache",
	});
}

function getWranglerArgs(args: {
	_: (string | number)[];
	config: string | undefined;
	env: string | undefined;
}): string[] {
	return [
		...(args.config ? ["--config", args.config] : []),
		...(args.env ? ["--env", args.env] : []),
		// Note: the first args in `_` will be the commands.
		...args._.slice(args._[0] === "populateCache" ? 2 : 1).map((a) => `${a}`),
	];
}

function withWranglerPassthroughArgs<
	T extends yargs.ArgumentsCamelCase<{
		config: string | undefined;
		env: string | undefined;
	}>,
>(args: T) {
	return { ...args, wranglerArgs: getWranglerArgs(args) };
}
