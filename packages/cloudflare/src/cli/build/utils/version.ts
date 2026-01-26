import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

/**
 * Returns the version of the Cloudflare package and its AWS dependency.
 */
export function getVersion(): { cloudflare: string; aws: string } {
	const require = createRequire(import.meta.url);
	const __dirname = fileURLToPath(new URL(".", import.meta.url));
	const pkgJson = require(join(__dirname, "../../../../package.json"));
	return {
		cloudflare: pkgJson.version,
		aws: pkgJson.dependencies["@opennextjs/aws"],
	};
}
