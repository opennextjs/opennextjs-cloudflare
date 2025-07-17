import yargs from "yargs";

import { addBuildCommand } from "./commands/build.js";
import { addDeployCommand } from "./commands/deploy.js";
import { addPopulateCacheCommand } from "./commands/populate-cache.js";
import { addPreviewCommand } from "./commands/preview.js";
import { addUploadCommand } from "./commands/upload.js";

export function runCommand() {
	let y = yargs(process.argv.slice(2))
		.scriptName("opennextjs-cloudflare")
		.parserConfiguration({ "unknown-options-as-args": true });

	y = addBuildCommand(y);
	y = addPreviewCommand(y);
	y = addDeployCommand(y);
	y = addUploadCommand(y);
	y = addPopulateCacheCommand(y);

	return y.demandCommand(1, 1).parse();
}
