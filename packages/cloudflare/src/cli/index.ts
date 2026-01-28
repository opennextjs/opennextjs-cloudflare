#!/usr/bin/env node

import logger from "@opennextjs/aws/logger.js";
import yargs from "yargs";

import { getVersion } from "./build/utils/version.js";
import { addBuildCommand } from "./commands/build.js";
import { addDeployCommand } from "./commands/deploy.js";
import { addMigrateCommand } from "./commands/migrate.js";
import { addPopulateCacheCommand } from "./commands/populate-cache.js";
import { addPreviewCommand } from "./commands/preview.js";
import { addUploadCommand } from "./commands/upload.js";

export function runCommand() {
	const y = yargs(process.argv.slice(2))
		.scriptName("opennextjs-cloudflare")
		.parserConfiguration({ "unknown-options-as-args": true })
		.strictCommands()
		.help()
		.alias("h", "help")
		.version(getVersion().cloudflare)
		.alias("v", "version")
		.fail((msg, err, yargs) => {
			if (msg) {
				logger.error(`${msg}\n`);
			}
			if (err) {
				throw err;
			}
			yargs.showHelp();
			process.exit(1);
		});

	addBuildCommand(y);
	addPreviewCommand(y);
	addDeployCommand(y);
	addUploadCommand(y);
	addPopulateCacheCommand(y);
	addMigrateCommand(y);

	return y.demandCommand(1, 1).parse();
}

await runCommand();
