import logger from "@opennextjs/aws/logger.js";
import type { ExternalMiddlewareConfig } from "@opennextjs/aws/types/open-next.js";

import type { OpenNextConfig } from "../../../api/config.js";

/**
 * Ensures open next is configured for cloudflare.
 *
 * @param config OpenNext configuration.
 */
export function ensureCloudflareConfig(config: OpenNextConfig) {
	const mwIsMiddlewareExternal = config.middleware?.external === true;
	const mwConfig = mwIsMiddlewareExternal ? (config.middleware as ExternalMiddlewareConfig) : undefined;

	const requirements = {
		// Check for the default function
		dftUseCloudflareWrapper: config.default?.override?.wrapper === "cloudflare-node",
		dftUseEdgeConverter: config.default?.override?.converter === "edge",
		dftUseFetchProxy: config.default?.override?.proxyExternalRequest === "fetch",
		dftMaybeUseCache:
			config.default?.override?.incrementalCache === "dummy" ||
			typeof config.default?.override?.incrementalCache === "function",
		dftMaybeUseTagCache:
			config.default?.override?.tagCache === "dummy" ||
			typeof config.default?.override?.incrementalCache === "function",
		dftMaybeUseQueue:
			config.default?.override?.queue === "dummy" ||
			config.default?.override?.queue === "direct" ||
			typeof config.default?.override?.queue === "function",
		// Check for the middleware function
		mwIsMiddlewareExternal,
		mwUseCloudflareWrapper: mwConfig?.override?.wrapper === "cloudflare-edge",
		mwUseEdgeConverter: mwConfig?.override?.converter === "edge",
		mwUseFetchProxy: mwConfig?.override?.proxyExternalRequest === "fetch",
		hasCryptoExternal: config.edgeExternals?.includes("node:crypto"),
	};

	if (config.default?.override?.queue === "direct") {
		logger.warn("The direct mode queue is not recommended for use in production.");
	}

	if (Object.values(requirements).some((satisfied) => !satisfied)) {
		const errorMessage =
			"The `open-next.config.ts` should have a default export like this:\n\n" +
			`{
          default: {
            override: {
              wrapper: "cloudflare-node",
              converter: "edge",
              proxyExternalRequest: "fetch",
              incrementalCache: "dummy" | function,
              tagCache: "dummy" | function,
              queue: "dummy" | "direct" | function,
            },
          },
          edgeExternals: ["node:crypto"],
          middleware: {
            external: true,
            override: {
              wrapper: "cloudflare-edge",
              converter: "edge",
              proxyExternalRequest: "fetch",
              incrementalCache: "dummy" | function,
              tagCache: "dummy" | function,
              queue: "dummy" | "direct" | function,
            },
          },
        }\n\n`.replace(/^ {8}/gm, "");
		if (config.cloudflare?.dangerousDisableConfigValidation) {
			logger.warn(errorMessage);
			return;
		}
		throw new Error(errorMessage);
	}
}
