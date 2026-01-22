import { execSync } from "node:child_process";
import fs, { cpSync } from "node:fs";
import path from "node:path";

import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import type yargs from "yargs";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { createOpenNextConfig } from "../utils/create-open-next-config.js";
import { createWranglerConfigFile } from "../utils/create-wrangler-config.js";

/**
 * Implementation of the `opennextjs-cloudflare init` command.
 *
 * @param args
 */
async function initCommand(): Promise<void> {
	logger.info("🚀 Setting up the OpenNext Cloudflare adapter...\n");

	if (fs.existsSync("open-next.config.ts")) {
		logger.info(
			`Exiting since the project is already configured for OpenNext (an \`open-next.config.ts\` file already exists)\n`
		);
		return;
	}

	// Check if running on Windows
	if (process.platform === "win32") {
		logger.warn("⚠️  Windows Support Notice:");
		logger.warn("OpenNext can be used on Windows systems but Windows full support is not guaranteed.");
		logger.warn("Please read more: https://opennext.js.org/cloudflare#windows-support\n");
	}

	// Package manager selection
	const { packager } = findPackagerAndRoot(".");
	const packageManager = packageManagers[packager];

	printStepTitle("Installing dependencies");
	try {
		execSync(`${packageManager.install} @opennextjs/cloudflare@latest`, { stdio: "inherit" });
		execSync(`${packageManager.installDev} wrangler@latest`, { stdio: "inherit" });
	} catch (error) {
		logger.error("❌ Failed to install dependencies:", (error as Error).message);
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
	if (!fs.existsSync("public")) {
		fs.mkdirSync("public");
	}
	if (fs.existsSync("public/_headers")) {
		logger.warn("⚠️ public/_headers file already exists\n");
	} else {
		cpSync(`${getPackageTemplatesDirPath()}/_headers`, "public/_headers");
	}

	printStepTitle("Updating package.json scripts");
	try {
		let packageJson: { scripts?: Record<string, string> } = {};
		if (fs.existsSync("package.json")) {
			packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
				scripts?: Record<string, string>;
			};
		}

		if (!packageJson.scripts) {
			packageJson.scripts = {};
		}

		packageJson.scripts.build = "next build";
		packageJson.scripts.preview = "opennextjs-cloudflare build && opennextjs-cloudflare preview";
		packageJson.scripts.deploy = "opennextjs-cloudflare build && opennextjs-cloudflare deploy";
		packageJson.scripts.upload = "opennextjs-cloudflare build && opennextjs-cloudflare upload";
		packageJson.scripts["cf-typegen"] = "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts";

		fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
	} catch (error) {
		logger.error("❌ Failed to update package.json:", (error as Error).message);
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
			fs.writeFileSync(".gitignore", `${gitignoreContent}\n${gitIgnoreOpenNextText}`);
		}
	}

	printStepTitle("Updating Next.js config");
	const configFiles = ["next.config.ts", "next.config.js", "next.config.mjs"];
	let configFile: string | null = null;

	for (const file of configFiles) {
		if (fs.existsSync(file)) {
			configFile = file;
			break;
		}
	}

	if (configFile) {
		let configContent = fs.readFileSync(configFile, "utf8");

		const importLine = 'import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";';
		if (!configContent.includes(importLine)) {
			configContent = importLine + "\n" + configContent;
		}

		const initLine = "initOpenNextCloudflareForDev();";
		if (!configContent.includes(initLine)) {
			configContent += "\n" + initLine + "\n";
		}

		fs.writeFileSync(configFile, configContent);
	} else {
		logger.warn("⚠️  No Next.js config file found, you may need to create one\n");
	}

	printStepTitle("Checking for edge runtime usage");
	try {
		const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
		const files = findFilesRecursive(".", extensions).slice(0, 100); // Limit to first 100 files
		let foundEdgeRuntime = false;

		for (const file of files) {
			try {
				const content = fs.readFileSync(file, "utf8");
				if (content.includes('export const runtime = "edge"')) {
					logger.warn(`⚠️  Found edge runtime in: ${file}`);
					foundEdgeRuntime = true;
				}
			} catch {
				// Skip files that can't be read
			}
		}

		if (foundEdgeRuntime) {
			logger.warn("\n🚨 WARNING:");
			logger.warn('Remove any export const runtime = "edge"; if present');
			logger.warn(
				'Before deploying your app, remove the export const runtime = "edge"; line from any of your source files.'
			);
			logger.warn("The edge runtime is not supported yet with @opennextjs/cloudflare.\n");
		}
	} catch {
		logger.warn("⚠️  Could not check for edge runtime usage\n");
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
		"Set up OpenNext.js for Cloudflare in an existing Next.js project",
		() => ({}),
		() => initCommand()
	);
}
