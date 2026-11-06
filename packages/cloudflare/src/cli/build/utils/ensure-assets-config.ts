import type { Unstable_Config } from "wrangler";

/**
 * Ensures that the assets are served like Next.js when `run_worker_first` is enabled.
 *
 * When `run_worker_first` is enabled, the assets are served from the routing layer, after the middleware.
 * Next.js only serves public files at their exact path while the assets binding can serve them at other paths:
 * - `html_handling` serves HTML files at aliases (e.g. `/foo` for `/foo.html`),
 * - `not_found_handling: "single-page-application"` serves `/index.html` for any missing file.
 * A middleware matching the exact path of a file would then not run for those other paths.
 *
 * Only the known safe values are allowed so that any new value fails the build.
 * `not_found_handling: "404-page"` is allowed as the asset resolver does not serve 404 responses.
 *
 * See https://developers.cloudflare.com/workers/static-assets/routing/
 *
 * @param assets - The `assets` section of the wrangler configuration.
 * @throws {Error} When `run_worker_first` is enabled and the assets would not be served like Next.js.
 */
export function ensureAssetsConfig(assets: Unstable_Config["assets"]): void {
	const runWorkerFirst = assets?.run_worker_first ?? false;
	// The Worker never runs first without a non-negative pattern
	if (
		runWorkerFirst === false ||
		(Array.isArray(runWorkerFirst) && runWorkerFirst.every((rule) => rule.startsWith("!")))
	) {
		return;
	}

	const htmlHandling = assets?.html_handling ?? "auto-trailing-slash";
	const notFoundHandling = assets?.not_found_handling ?? "none";

	if (htmlHandling !== "none" || (notFoundHandling !== "none" && notFoundHandling !== "404-page")) {
		throw new Error(
			"When `run_worker_first` is enabled, the `assets` section of the wrangler configuration must be:\n\n" +
				`{
				  "assets": {
				    "html_handling": "none",
				    "not_found_handling": "none" // or "404-page"
				  }
				}\n\n`.replace(/^\t{4}/gm, "") +
				`Found "html_handling": "${htmlHandling}" and "not_found_handling": "${notFoundHandling}".\n` +
				"Next.js only serves public files at their exact path, other values would allow bypassing the middleware."
		);
	}
}
