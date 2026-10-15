import path from "node:path";

import { type BuildOptions, compareSemver } from "@opennextjs/aws/build/helper.js";
import { applyRule, parseCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

type CacheComponentsNextConfig = NextConfig & {
	cacheComponents?: boolean;
	experimental?: {
		cacheComponents?: boolean;
		dynamicIO?: boolean;
	};
};

export const cacheComponentsSchedulerModule = "__opennext_cache_components_scheduler";

/**
 * The flag is `experimental.dynamicIO` in Next.js 15.4, `experimental.cacheComponents` in 15.5 and
 * `cacheComponents` from 16.0.
 */
export function isCacheComponentsEnabled(nextConfig: NextConfig): boolean {
	const config: CacheComponentsNextConfig = nextConfig;
	return Boolean(
		config.cacheComponents ?? config.experimental?.cacheComponents ?? config.experimental?.dynamicIO
	);
}

/** Next.js before 16.2 stages its renders with functions that are not covered. */
export function needsCacheComponentsScheduler(buildOpts: BuildOptions, nextConfig: NextConfig): boolean {
	return isCacheComponentsEnabled(nextConfig) && !compareSemver(buildOpts.nextVersion, "<", "16.2.0");
}

const runnerContentFilter = /DANGEROUSLY_runPendingImmediatesAfterCurrentTask/;

/**
 * The runner is compiled into the app page runtimes, into the server chunks when the bundler inlines
 * the runtime, and stays a standalone module for the callers that are not part of a runtime.
 */
export const runnerFileFilter = getCrossPlatformPathRegex(
	String.raw`/(?:next/dist/compiled/next-server/app-page(?:-turbo)?(?:-experimental)?\.runtime\.prod|\.next/server/chunks/.+|next/dist/(?:esm/)?server/app-render/app-render-render-utils)\.js$`,
	{ escape: false }
);

export function patchCacheComponents(
	updater: ContentUpdater,
	buildOpts: BuildOptions,
	nextConfig: NextConfig
): Plugin {
	if (!needsCacheComponentsScheduler(buildOpts, nextConfig)) {
		return { name: "patch-cache-components", setup() {} };
	}

	let patchedFiles = 0;

	updater.updateContent("cache-components-scheduler", [
		{
			filter: runnerFileFilter,
			contentFilter: runnerContentFilter,
			callback: async ({ contents, path: filePath }) => {
				patchedFiles++;
				return patchRunInSequentialTasks(contents, filePath);
			},
		},
	]);

	return {
		name: "patch-cache-components",
		setup(build) {
			build.onResolve({ filter: new RegExp(`^${cacheComponentsSchedulerModule}$`) }, () => ({
				path: path.join(buildOpts.outputDir, "cloudflare-templates/cache-components-scheduler.js"),
			}));

			build.onEnd((result) => {
				if (result.errors.length === 0 && patchedFiles === 0) {
					throw new Error(
						`Cache Components is enabled but \`runInSequentialTasks\` was not found in Next.js ${buildOpts.nextVersion}. The app would render incomplete responses on Workers. Please report this to @opennextjs/cloudflare.`
					);
				}
			});
		},
	};
}

export function patchRunInSequentialTasks(code: string, filePath: string): string {
	const root = parseCode(code);
	const { edits } = applyRule(runInSequentialTasksRule, root);

	if (edits.length !== 1) {
		throw new Error(
			`Expected one \`runInSequentialTasks\` in ${filePath} but found ${edits.length}. Please report this to @opennextjs/cloudflare with your Next.js version.`
		);
	}

	return root.commitEdits(edits);
}

/**
 * The minifier renames the function and inlines its timer group, but both callees are properties of
 * an external module and keep their names.
 */
export const runInSequentialTasksRule = `
rule:
  pattern:
    selector: function_declaration
    context: "function $FUNCTION($$$ARGS) { $$$BODY }"
  all:
    - has:
        regex: DANGEROUSLY_runPendingImmediatesAfterCurrentTask
        stopBy: end
    - has:
        regex: expectNoPendingImmediates
        stopBy: end
    - not:
        has:
          kind: function_declaration
          stopBy: end
          has:
            regex: DANGEROUSLY_runPendingImmediatesAfterCurrentTask
            stopBy: end
fix: |-
  function $FUNCTION(first, ...rest) {
    return require("${cacheComponentsSchedulerModule}").runInSequentialTasks(first, ...rest);
  }
`;
