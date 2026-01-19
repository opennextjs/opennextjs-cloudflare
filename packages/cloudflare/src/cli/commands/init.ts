import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Enquirer from "enquirer";
import type yargs from "yargs";

interface PackageManager {
	name: string;
	install: string;
	installDev: string;
}

const packageManagers = {
	pnpm: { name: "pnpm", install: "pnpm add", installDev: "pnpm add -D" },
	npm: { name: "npm", install: "npm install", installDev: "npm install --save-dev" },
	bun: { name: "bun", install: "bun add", installDev: "bun add -D" },
	yarn: { name: "yarn", install: "yarn add", installDev: "yarn add -D" },
	deno: { name: "deno", install: "deno add", installDev: "deno add --dev" },
} satisfies Record<string, PackageManager>;

async function selectPackageManager(): Promise<PackageManager> {
	const choices = Object.entries(packageManagers).map(([key, pm], index) => ({
		name: key,
		message: `${index + 1}. ${pm.name}`,
		value: key,
	}));

	const answer = await Enquirer.prompt<{ packageManager: string }>({
		type: "select",
		name: "packageManager",
		message: "📦 Select your package manager:",
		choices,
	});

	return packageManagers[answer.packageManager as keyof typeof packageManagers] ?? packageManagers.npm;
}

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

	// Check if running on Windows
	if (process.platform === "win32") {
		console.log("⚠️  Windows Support Notice:");
		console.log("OpenNext can be used on Windows systems but Windows full support is not guaranteed.");
		console.log("Please read more: https://opennext.js.org/cloudflare#windows-support\n");
	}

	// Package manager selection
	const selectedPM = await selectPackageManager();
	console.log("");

	// Step 1: Install dependencies
	console.log(`📦 Installing dependencies with ${selectedPM.name}...`);
	try {
		execSync(`${selectedPM.install} @opennextjs/cloudflare@latest`, { stdio: "inherit" });
		execSync(`${selectedPM.installDev} wrangler@latest`, { stdio: "inherit" });
		console.log("✅ Dependencies installed\n");
	} catch (error) {
		console.error("❌ Failed to install dependencies:", (error as Error).message);
		process.exit(1);
	}

	// Step 2: Read package.json to get app name
	let appName = "my-app";
	try {
		if (fs.existsSync("package.json")) {
			const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
				name?: string;
			};
			if (packageJson.name) {
				appName = packageJson.name;
			}
		}
	} catch {
		console.log('⚠️  Could not read package.json, using default name "my-app"');
	}

	// Step 3: Create/update wrangler.jsonc
	console.log("⚙️  Creating wrangler.jsonc...");
	const wranglerConfig = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "${appName}",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": [
    // Enable Node.js API
    // see https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility-flag
    "nodejs_compat",
    // Allow to fetch URLs in your app
    // see https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public
    "global_fetch_strictly_public",
  ],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS",
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      // The service should match the "name" of your worker
      "service": "${appName}",
    },
  ],
  "r2_buckets": [
    // Create a R2 binding with the binding name "NEXT_INC_CACHE_R2_BUCKET"
    // {
    //   "binding": "NEXT_INC_CACHE_R2_BUCKET",
    //   "bucket_name": "<BUCKET_NAME>",
    // },
  ],
}`;
	fs.writeFileSync("wrangler.jsonc", wranglerConfig);
	console.log("✅ wrangler.jsonc created\n");

	// Step 4: Create open-next.config.ts
	console.log("⚙️  Creating open-next.config.ts...");
	const openNextConfig = `import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
`;

	if (!fs.existsSync("open-next.config.ts")) {
		fs.writeFileSync("open-next.config.ts", openNextConfig);
		console.log("✅ open-next.config.ts created\n");
	} else {
		console.log("✅ open-next.config.ts already exists\n");
	}

	// Step 5: Create .dev.vars
	console.log("📝 Creating .dev.vars...");
	const devVarsContent = `NEXTJS_ENV=development
`;

	if (!fs.existsSync(".dev.vars")) {
		fs.writeFileSync(".dev.vars", devVarsContent);
		console.log("✅ .dev.vars created\n");
	} else {
		console.log("✅ .dev.vars already exists\n");
	}

	// Step 6: Create _headers in public folder
	console.log("📁 Creating _headers in public folder...");
	if (!fs.existsSync("public")) {
		fs.mkdirSync("public");
	}
	const headersContent = `/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
`;
	fs.writeFileSync("public/_headers", headersContent);
	console.log("✅ _headers created in public folder\n");

	// Step 7: Update package.json scripts
	console.log("📝 Updating package.json scripts...");
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
		console.log("✅ package.json scripts updated\n");
	} catch (error) {
		console.error("❌ Failed to update package.json:", (error as Error).message);
	}

	// Step 8: Add .open-next to .gitignore
	console.log("📋 Updating .gitignore...");
	let gitignoreContent = "";
	if (fs.existsSync(".gitignore")) {
		gitignoreContent = fs.readFileSync(".gitignore", "utf8");
	}

	if (!gitignoreContent.includes(".open-next")) {
		gitignoreContent += "\n# OpenNext\n.open-next\n";
		fs.writeFileSync(".gitignore", gitignoreContent);
		console.log("✅ .open-next added to .gitignore\n");
	} else {
		console.log("✅ .open-next already in .gitignore\n");
	}

	// Step 9: Update Next.js config
	console.log("⚙️  Updating Next.js config...");
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
		console.log(`✅ ${configFile} updated\n`);
	} else {
		console.log("⚠️  No Next.js config file found, you may need to create one\n");
	}

	// Step 10: Check for edge runtime usage
	console.log("🔍 Checking for edge runtime usage...");
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
		} else {
			console.log("✅ No edge runtime declarations found\n");
		}
	} catch {
		console.log("⚠️  Could not check for edge runtime usage\n");
	}

	console.log("🎉 OpenNext.js for Cloudflare setup complete!");
	console.log("\nNext steps:");
	const runCommand =
		selectedPM.name === "npm" ? "npm run" : selectedPM.name === "yarn" ? "yarn" : `${selectedPM.name} run`;
	console.log(`1. Run: ${runCommand} build`);
	console.log(`2. Run: ${runCommand} preview (to test locally)`);
	console.log(`3. Run: ${runCommand} deploy (to deploy to Cloudflare)`);
	console.log(`\nFor development, continue using: ${runCommand} dev`);
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
