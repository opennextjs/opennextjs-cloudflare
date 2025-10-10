import { join } from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import type { Plugin } from "esbuild";

export function shimRequireHook(options: BuildOptions): Plugin {
	const emptyShimPath = join(options.outputDir, "cloudflare-templates/shims/empty.js");
	return {
		name: "replaceRelative",
		setup(build) {
			// Note: we (empty) shim require-hook modules as they generate problematic code that uses requires
			build.onResolve(
				{ filter: getCrossPlatformPathRegex(String.raw`^\./require-hook$`, { escape: false }) },
				() => ({
					path: emptyShimPath,
				})
			);
		},
	};
}
