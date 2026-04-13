import * as buildHelper from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

/**
 * Validates that the Next.js version is supported and checks wrangler compatibility.
 *
 * Note: this function assumes that wrangler is installed.
 *
 * @param options.nextVersion The detected Next.js version string
 * @throws {Error} If the Next.js version is unsupported
 */
export async function ensureNextjsVersionSupported({
	nextVersion,
}: Pick<buildHelper.BuildOptions, "nextVersion">) {
	if (buildHelper.compareSemver(nextVersion, "<", "14.2.0")) {
		throw new Error("Next.js version unsupported, please upgrade to version 14.2 or greater.");
	}

	const {
		default: { version: wranglerVersion },
	} = await import("wrangler/package.json", { with: { type: "json" } });

	// We need a version of workerd that has a fix for setImmediate for Next.js 16.1+
	// See:
	// - https://github.com/cloudflare/workerd/pull/5869
	// - https://github.com/opennextjs/opennextjs-cloudflare/issues/1049
	if (
		buildHelper.compareSemver(nextVersion, ">=", "16.1.0") &&
		buildHelper.compareSemver(wranglerVersion, "<", "4.59.2")
	) {
		logger.warn(`Next.js 16.1+ requires wrangler 4.59.2 or greater (${wranglerVersion} detected).`);
	}
}
