import { join } from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import type { Plugin } from "esbuild";

/**
 * `react-dom/server.edge` requires:
 * - `react-dom-server.edge.production.js`
 * - `react-dom-server.browser.production.js`
 * - `react-dom-server-legacy.browser.production.js`
 *
 * However only the first one is needed in the Cloudflare Workers environment.
 * The other two can be shimmed to an empty module to reduce the bundle size.
 *
 * @param options Build options
 * @returns An ESBuild plugin that shims unnecessary React modules
 */
export function shimReact(options: BuildOptions): Plugin {
	const emptyShimPath = join(options.outputDir, "cloudflare-templates/shims/empty.js");
	return {
		name: "react-shim",
		setup(build) {
			build.onResolve(
				{
					filter: getCrossPlatformPathRegex(
						String.raw`(react-dom-server\.browser\.production\.js|react-dom-server-legacy\.browser\.production\.js)$`,
						{ escape: false }
					),
				},
				() => ({
					path: emptyShimPath,
				})
			);
		},
	};
}
