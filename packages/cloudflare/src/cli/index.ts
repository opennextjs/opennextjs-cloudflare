#!/usr/bin/env node

import yargs from "yargs";

import { addBuildCommand } from "./commands/build.js";
import { addDeployCommand } from "./commands/deploy.js";
import { addPopulateCacheCommand } from "./commands/populate-cache.js";
import { addPreviewCommand } from "./commands/preview.js";
import { addUploadCommand } from "./commands/upload.js";

export function runCommand() {
	const y = yargs(process.argv.slice(2).filter((arg) => arg !== "--"))
		.scriptName("opennextjs-cloudflare")
		.parserConfiguration({ "unknown-options-as-args": true });

	addBuildCommand(y);
	addPreviewCommand(y);
	addDeployCommand(y);
	addUploadCommand(y);
	addPopulateCacheCommand(y);

	return y.demandCommand(1, 1).parse();
}

await runCommand();
