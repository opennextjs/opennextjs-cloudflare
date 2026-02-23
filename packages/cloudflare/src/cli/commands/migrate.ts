import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
	checkRunningInsideNextjsApp,
	findNextConfig,
	findPackagerAndRoot,
	getNextVersion,
} from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import type yargs from "yargs";

import { askConfirmation } from "../utils/ask-confirmation.js";
import { createOpenNextConfigFile, findOpenNextConfig } from "../utils/create-open-next-config.js";
import { createWranglerConfigFile, findWranglerConfig } from "../utils/create-wrangler-config.js";
import { ensureNextjsVersionSupported } from "../utils/nextjs-support.js";
import { conditionalAppendFileSync } from "./utils/files.js";
import { printHeaders } from "./utils/utils.js";

/**
 * Implementation of the `opennextjs-cloudflare migrate` command.
 *
 * @param args
 */
async function migrateCommand(args: { forceInstall: boolean }): Promise<void> {
	printHeaders("migrate");

	logger.info("🚀 Setting up the OpenNext Cloudflare adapter...\n");

	const projectDir = process.cwd();

	const nextConfigFileCreated = await maybeCreateNextConfigFileIfMissing(projectDir, args.forceInstall).catch(
		(e) => {
			logger.error(`${e instanceof Error ? e.message : e}\n`);
			process.exit(1);
		}
	);

	if (nextConfigFileCreated === false) {
		logger.error("The next.config file is required, aborting!\n");
		process.exit(1);
	}

	checkRunningInsideNextjsApp({ appPath: projectDir });

	const wranglerConfigFilePath = findWranglerConfig(projectDir);
	if (wranglerConfigFilePath) {
		logger.error(
			`The project already contains a Wrangler config file (at ${wranglerConfigFilePath}).\n` +
				"This means that your application is either a static site or a next-on-pages project.\n" +
				"If your project is a static site and you want to migrate to OpenNext, delete the Wrangler configuration file, convert the project to a full stack one and try again." +
				" if your project is a next-on-pages one remove any next-on-pages configuration, any edge runtime usage and try again."
		);
		process.exit(1);
	}

	if (findOpenNextConfig(projectDir)) {
		logger.info(
			`Exiting since the project is already configured for OpenNext (an \`open-next.config.ts\` file already exists)\n`
		);
		return;
	}

	const { packager } = findPackagerAndRoot(projectDir);
	const packageManager = packageManagers[packager];

	printStepTitle("Installing dependencies");
	try {
		const forceFlag = args.forceInstall ? " --force" : "";
		childProcess.execSync(`${packageManager.install}${forceFlag} @opennextjs/cloudflare@latest`, {
			stdio: "inherit",
		});
		childProcess.execSync(`${packageManager.installDev}${forceFlag} wrangler@latest`, { stdio: "inherit" });
	} catch (error) {
		logger.error("Failed to install dependencies:", (error as Error).message);
		process.exit(1);
	}

	printStepTitle("Creating wrangler.jsonc");
	const { cachingEnabled } = await createWranglerConfigFile("./");

	if (!cachingEnabled) {
		logger.warn(
			`Failed to set up cache for your project.\n` +
				`After the migration completes, please manually setup cache in  wrangler.jsonc and open-next.config.ts files (for more details see: https://opennext.js.org/cloudflare/caching).\n`
		);
	}

	printStepTitle("Creating open-next.config.ts");
	createOpenNextConfigFile("./", { cache: cachingEnabled });

	const devVarsExists = fs.existsSync(".dev.vars");
	printStepTitle(`${devVarsExists ? "Updating" : "Creating"} .dev.vars file`);
	conditionalAppendFileSync(".dev.vars", "NEXTJS_ENV=development\n", {
		appendIf: (content) => !/\bNEXTJS_ENV\b/.test(content),
		appendPrefix: "\n",
	});

	printStepTitle(`${fs.existsSync("public/_headers") ? "Updating" : "Creating"} public/_headers file`);
	conditionalAppendFileSync(
		"public/_headers",
		"# https://developers.cloudflare.com/workers/static-assets/headers\n" +
			"# https://opennext.js.org/cloudflare/caching#static-assets-caching\n" +
			"/_next/static/*\n" +
			"  Cache-Control: public,max-age=31536000,immutable\n",
		{
			appendIf: (content) => !/^\/_next\/static\/*\b/.test(content),
			appendPrefix: "\n\n",
		}
	);

	printStepTitle("Updating package.json scripts");
	const openNextScripts = {
		preview: "opennextjs-cloudflare build && opennextjs-cloudflare preview",
		deploy: "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
		upload: "opennextjs-cloudflare build && opennextjs-cloudflare upload",
		["cf-typegen"]: "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts",
	};
	try {
		let packageJson: { scripts?: Record<string, string> } = {};
		if (fs.existsSync("package.json")) {
			packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
				scripts?: Record<string, string>;
			};
		}

		packageJson.scripts = {
			build: "next build",
			...packageJson.scripts,
			...openNextScripts,
		};

		fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
	} catch (error) {
		logger.error("Failed to update package.json", (error as Error).message);
		logger.warn(
			"\nPlease ensure that your package.json contains the following scripts:\n" +
				console.log(
					[...Object.entries(openNextScripts)].map(([key, value]) => ` - ${key}: ${value}`).join("\n")
				) +
				"\n"
		);
	}

	const gitIgnoreExists = fs.existsSync(".gitignore");
	printStepTitle(`${gitIgnoreExists ? "Updating" : "Creating"} .gitignore file`);
	conditionalAppendFileSync(".gitignore", "# OpenNext\n.open-next\n", {
		appendIf: (content) => !content.includes(".open-next"),
		appendPrefix: "\n",
	});

	const nextConfig = findNextConfig({ appPath: projectDir });

	// At this point the next config file should exist (it either
	// was part of the original project or we've created it)
	assert(nextConfig, "Next config file unexpectedly missing");

	printStepTitle("Updating Next.js config");
	conditionalAppendFileSync(
		nextConfig.path,
		"import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());\n",
		{
			appendIf: (content) => !content.includes("initOpenNextCloudflareForDev"),
			appendPrefix: "\n",
		}
	);

	printStepTitle("Checking for edge runtime usage");
	try {
		const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];
		const files = findFilesRecursive(projectDir, extensions);
		let foundEdgeRuntime = false;

		for (const file of files) {
			try {
				const content = fs.readFileSync(file, "utf8");
				if (content.includes('export const runtime = "edge"')) {
					logger.warn(`Found edge runtime in: ${file}`);
					foundEdgeRuntime = true;
					break;
				}
			} catch {
				// Skip files that can't be read
			}
		}

		if (foundEdgeRuntime) {
			logger.warn(
				"Detected usage of the edge runtime.\n" +
					"The edge runtime is not supported yet with @opennextjs/cloudflare.\n" +
					'Remove all the `export const runtime = "edge";` lines from your source files'
			);
		}
	} catch {
		logger.warn(
			"Failed to check for edge runtime usage.\n" +
				"The edge runtime is not supported yet with @opennextjs/cloudflare.\n" +
				'If present, remove all the `export const runtime = "edge";` lines from your source files'
		);
	}

	logger.info(
		"🎉 OpenNext Cloudflare adapter complete!\n" +
			"\nNext steps:\n" +
			`- Run: "${packageManager.run} preview" to build and preview your Cloudflare application locally\n` +
			`- Run: "${packageManager.run} deploy" to deploy your application to Cloudflare Workers\n` +
			(cachingEnabled
				? ""
				: `- ⚠️  Setup cache, see https://opennext.js.org/cloudflare/caching for more details\n`)
	);
}

interface PackageManager {
	name: string;
	install: string;
	installDev: string;
	run: string;
}

const packageManagers = {
	pnpm: { name: "pnpm", install: "pnpm add", installDev: "pnpm add -D", run: "pnpm run" },
	npm: { name: "npm", install: "npm install", installDev: "npm install --save-dev", run: "npm run" },
	bun: { name: "bun", install: "bun add", installDev: "bun add -D", run: "bun" },
	yarn: { name: "yarn", install: "yarn add", installDev: "yarn add -D", run: "yarn" },
} satisfies Record<string, PackageManager>;

/**
 * Recursively searches a directory for files with specified extensions.
 *
 * Skips common build/cache directories: node_modules, .next, .open-next, .git, dist, build.
 *
 * @param dir - The directory path to start searching from
 * @param extensions - Array of file extensions to match
 * @param fileList - Accumulator array for found files (used internally for recursion)
 * @returns Array of file paths matching the specified extensions
 */
function findFilesRecursive(dir: string, extensions: string[], fileList: string[] = []): string[] {
	const files = fs.readdirSync(dir);

	files.forEach((file) => {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			// Skip node_modules, .next, .open-next, and other common build/cache directories
			if (!["node_modules", ".next", ".open-next", ".git", "dist", "build"].includes(file)) {
				findFilesRecursive(filePath, extensions, fileList);
			}
		} else if (stat.isFile()) {
			const ext = path.extname(file).toLowerCase();
			if (extensions.includes(ext)) {
				fileList.push(filePath);
			}
		}
	});

	return fileList;
}

function printStepTitle(title: string): void {
	logger.info(`⚙️  ${title}...\n`);
}

/**
 * Creates a plain next.config.ts file
 *
 * @param appDir The directory where the config file should be created
 */
function createNextConfigFile(appDir: string): void {
	const nextConfigPath = path.join(appDir, "next.config.ts");
	const content = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`;
	fs.writeFileSync(nextConfigPath, content);
}

/**
 * Creates a next.config.ts file, after asking for the user's confirmation, if missing in the project's directory.
 *
 * To be safe, this function also ensures that the "next" package is installed and its version is compatible with OpenNext.
 *
 * @param projectDir The project directory to check
 * @param skipNextVersionCheck Whether to bypass the "next" version compatibility check
 * @returns A boolean representing whether the user has accepter the creation of the config file, undefined if the file already existed
 * @throws {Error} If "next" is not installed or the Next.js version is incompatible with open-next
 */
async function maybeCreateNextConfigFileIfMissing(
	projectDir: string,
	skipNextVersionCheck: boolean
): Promise<boolean | undefined> {
	if (findNextConfig({ appPath: projectDir })) {
		return;
	}

	let nextVersion: string;
	try {
		nextVersion = getNextVersion(projectDir);
	} catch {
		throw new Error(
			"This does not appear to be a Next.js application. The 'next' package is not installed and no next.config file was found."
		);
	}

	if (!skipNextVersionCheck) {
		await ensureNextjsVersionSupported({ nextVersion });
	}

	const answer = await askConfirmation("Missing required next.config file. Do you want to create one?");

	if (!answer) {
		return false;
	}

	createNextConfigFile(projectDir);
	logger.info("Created next.config.ts\n");
	return true;
}

/**
 * Add the `migrate` command to yargs configuration.
 */
export function addMigrateCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"migrate",
		"Set up the OpenNext Cloudflare adapter in an existing Next.js project",
		(args) =>
			args.option("forceInstall", {
				type: "boolean",
				alias: "f",
				desc: "Install the dependencies using the `--force` flag.",
				default: false,
			}),
		(args) => migrateCommand(args)
	);
}
