import { execSync } from "node:child_process";
import fs, { cpSync } from "node:fs";
import path from "node:path";

import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";
import type yargs from "yargs";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { createOpenNextConfig } from "../utils/create-open-next-config.js";
import { createWranglerConfigFile } from "../utils/create-wrangler-config.js";

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

/**
 * Implementation of the `opennextjs-cloudflare init` command.
 *
 * @param args
 */
async function initCommand(): Promise<void> {
	console.log("🚀 Setting up OpenNext.js for Cloudflare...\n");

	if (fs.existsSync("open-next.config.ts")) {
		console.log(
			`Exiting since the project is already configured for OpenNext (an \`open-next.config.ts\` file already exists)\n`
		);
		return;
	}

	// Check if running on Windows
	if (process.platform === "win32") {
		console.log("⚠️  Windows Support Notice:");
		console.log("OpenNext can be used on Windows systems but Windows full support is not guaranteed.");
		console.log("Please read more: https://opennext.js.org/cloudflare#windows-support\n");
	}

	// Package manager selection
	const { packager } = findPackagerAndRoot(".");
	const packageManager = packageManagers[packager];

	runStep("Installing dependencies", () => {
		try {
			execSync(`${packageManager.install} @opennextjs/cloudflare@latest`, { stdio: "inherit" });
			execSync(`${packageManager.installDev} wrangler@latest`, { stdio: "inherit" });
		} catch (error) {
			console.error("❌ Failed to install dependencies:", (error as Error).message);
			process.exit(1);
		}
	});

	runStep("Creating wrangler.jsonc", async () => {
		await createWranglerConfigFile("./");
	});

	runStep("Creating open-next.config.ts", async () => {
		await createOpenNextConfig("./");
	});

	if (!fs.existsSync(".dev.vars")) {
		runStep("Creating .dev.vars", () => {
			const devVarsContent = `NEXTJS_ENV=development\n`;
			fs.writeFileSync(".dev.vars", devVarsContent);
		});
	}

	runStep("Creating _headers in public folder", () => {
		if (!fs.existsSync("public")) {
			fs.mkdirSync("public");
		}
		if (fs.existsSync("public/_headers")) {
			console.log("⚠️  No public/_headers file already exists\n");
		} else {
			cpSync(`${getPackageTemplatesDirPath()}/_headers`, "public/_headers");
		}
	});

	runStep("Updating package.json scripts", () => {
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
			console.error("❌ Failed to update package.json:", (error as Error).message);
			// TODO: instruct user to update their `build`, `preview` and `upload` scripts
		}
	});

	const gitIgnoreExists = fs.existsSync(".gitignore");

	runStep(`${gitIgnoreExists ? "Updating" : "Creating"} .gitignore file`, () => {
		const gitIgnoreOpenNextText = "# OpenNext\n.open-next\n";

		if (!gitIgnoreExists) {
			fs.writeFileSync(".gitignore", gitIgnoreOpenNextText);
		} else {
			const gitignoreContent = fs.readFileSync(".gitignore", "utf8");
			if (!gitignoreContent.includes(".open-next")) {
				fs.writeFileSync(".gitignore", `${gitignoreContent}\n${gitIgnoreOpenNextText}`);
			}
		}
	});

	runStep("Updating Next.js config", () => {
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
			const initLine = "initOpenNextCloudflareForDev();";

			if (!configContent.includes(importLine)) {
				// Add import at the top
				configContent = importLine + "\n" + configContent;
			}

			if (!configContent.includes(initLine)) {
				// Add init call at the end
				configContent += "\n" + initLine + "\n";
			}

			fs.writeFileSync(configFile, configContent);
		} else {
			console.log("⚠️  No Next.js config file found, you may need to create one\n");
		}
	});

	runStep("Checking for edge runtime usage", () => {
		try {
			const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
			const files = findFilesRecursive(".", extensions).slice(0, 100); // Limit to first 100 files
			let foundEdgeRuntime = false;

			for (const file of files) {
				try {
					const content = fs.readFileSync(file, "utf8");
					if (content.includes('export const runtime = "edge"')) {
						console.log(`⚠️  Found edge runtime in: ${file}`);
						foundEdgeRuntime = true;
					}
				} catch {
					// Skip files that can't be read
				}
			}

			if (foundEdgeRuntime) {
				console.log("\n🚨 WARNING:");
				console.log('Remove any export const runtime = "edge"; if present');
				console.log(
					'Before deploying your app, remove the export const runtime = "edge"; line from any of your source files.'
				);
				console.log("The edge runtime is not supported yet with @opennextjs/cloudflare.\n");
			}
		} catch {
			console.log("⚠️  Could not check for edge runtime usage\n");
		}
	});

	console.log("🎉 OpenNext.js for Cloudflare setup complete!");
	console.log("\nNext steps:");
	console.log(
		`- Run: "${packageManager.run} preview" to build and preview your Cloudflare application locally`
	);
	console.log(`- Run: "${packageManager.run} deploy" to deploy your application to Cloudflare Workers`);
}

async function runStep(stepText: string, stepLogic: () => void | Promise<void>): Promise<void> {
	console.log(`⚙️  ${stepText}...\n`);
	await stepLogic();
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
