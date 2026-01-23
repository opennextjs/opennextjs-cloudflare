import { execSync } from "node:child_process";
import fs, { cpSync } from "node:fs";
import path from "node:path";

import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import type yargs from "yargs";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { getNextConfigPath } from "../utils/next-config.js";
import { createOpenNextConfig, getOpenNextConfigPath } from "../utils/open-next-config.js";
import { createWranglerConfigFile } from "../utils/wrangler-config.js";
import { printHeaders } from "./utils.js";

/**
 * Implementation of the `opennextjs-cloudflare init` command.
 *
 * @param args
 */
async function initCommand(): Promise<void> {
	printHeaders("init");

	logger.info("🚀 Setting up the OpenNext Cloudflare adapter...\n");

	const nextConfigFilePath = getNextConfigPath(".");

	if (!nextConfigFilePath) {
		logger.error(
			`No Next.js config file detected, are you sure that this current directory contains a Next.js project? aborting\n`
		);
		process.exit(1);
	}

	if (getOpenNextConfigPath(".")) {
		logger.info(
			`Exiting since the project is already configured for OpenNext (an \`open-next.config.ts\` file already exists)\n`
		);
		return;
	}

	// Package manager selection
	const { packager } = findPackagerAndRoot(".");
	const packageManager = packageManagers[packager];

	printStepTitle("Installing dependencies");
	try {
		execSync(`${packageManager.install} @opennextjs/cloudflare@latest`, { stdio: "inherit" });
		execSync(`${packageManager.installDev} wrangler@latest`, { stdio: "inherit" });
	} catch (error) {
		logger.error("Failed to install dependencies:", (error as Error).message);
		process.exit(1);
	}

	printStepTitle("Creating wrangler.jsonc");
	await createWranglerConfigFile("./");

	printStepTitle("Creating open-next.config.ts");
	await createOpenNextConfig("./");

	if (!fs.existsSync(".dev.vars")) {
		printStepTitle("Creating .dev.vars");
		fs.writeFileSync(".dev.vars", `NEXTJS_ENV=development\n`);
	}

	printStepTitle("Creating _headers in public folder");
	if (fs.existsSync("public/_headers")) {
		logger.warn("public/_headers file already exists\n");
	} else {
		cpSync(`${getPackageTemplatesDirPath()}/_headers`, "public/_headers", { recursive: true });
	}

	printStepTitle("Updating package.json scripts");
	try {
		let packageJson: { scripts?: Record<string, string> } = {};
		if (fs.existsSync("package.json")) {
			packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
				scripts?: Record<string, string>;
			};
		}

		packageJson.scripts = {
			...packageJson.scripts,
			build: "next build",
			preview: "opennextjs-cloudflare build && opennextjs-cloudflare preview",
			deploy: "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
			upload: "opennextjs-cloudflare build && opennextjs-cloudflare upload",
			["cf-typegen"]: "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts",
		};

		fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
	} catch (error) {
		logger.error("Failed to update package.json:", (error as Error).message);
		// TODO: instruct user to update their `build`, `preview` and `upload` scripts
	}

	const gitIgnoreExists = fs.existsSync(".gitignore");

	printStepTitle(`${gitIgnoreExists ? "Updating" : "Creating"} .gitignore file`);
	const gitIgnoreOpenNextText = "# OpenNext\n.open-next\n";

	if (!gitIgnoreExists) {
		fs.writeFileSync(".gitignore", gitIgnoreOpenNextText);
	} else {
		const gitignoreContent = fs.readFileSync(".gitignore", "utf8");
		if (!gitignoreContent.includes(".open-next")) {
			fs.appendFileSync(".gitignore", `\n${gitIgnoreOpenNextText}`);
		}
	}

	printStepTitle("Updating Next.js config");

	let configContent = fs.readFileSync(nextConfigFilePath, "utf8");

	const importLine = 'import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";';
	if (!configContent.includes(importLine)) {
		configContent = importLine + "\n" + configContent;
	}

	const initLine = "initOpenNextCloudflareForDev();";
	if (!configContent.includes(initLine)) {
		configContent += "\n" + initLine + "\n";
	}

	fs.writeFileSync(nextConfigFilePath, configContent);

	printStepTitle("Checking for edge runtime usage");
	try {
		const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];
		const files = findFilesRecursive(".", extensions);
		let foundEdgeRuntime = false;

		for (const file of files) {
			try {
				const content = fs.readFileSync(file, "utf8");
				if (content.includes('export const runtime = "edge"')) {
					logger.warn(`Found edge runtime in: ${file}`);
					foundEdgeRuntime = true;
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

	logger.info("🎉 OpenNext.js for Cloudflare setup complete!");
	logger.info("\nNext steps:");
	logger.info(
		`- Run: "${packageManager.run} preview" to build and preview your Cloudflare application locally`
	);
	logger.info(`- Run: "${packageManager.run} deploy" to deploy your application to Cloudflare Workers`);
}

interface PackageManager {
	name: string;
	install: string;
	installDev: string;
	run: string;
}

const packageManagers = {
	pnpm: { name: "pnpm", install: "pnpm add", installDev: "pnpm add -D", run: "pnpm" },
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
 * @param extensions - Array of file extensions to match (e.g., ['.ts', '.js'])
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
 * Add the `init` command to yargs configuration.
 */
export function addInitCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"init",
		"Set up the OpenNext Cloudflare adapter in an existing Next.js project",
		() => ({}),
		() => initCommand()
	);
}
