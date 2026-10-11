/**
 * Next.js renders a Cache Components page as a sequence of event loop tasks, one per stage, and
 * between two tasks it runs the immediates that React scheduled so each stage is flushed before the
 * next one starts. It finds the end of a task with `process.nextTick`, which workerd implements as
 * `queueMicrotask`: the stage boundary lands too early and the response loses content.
 *
 * Replace the staged runner with the workerd implementation in `templates/cache-components-scheduler.ts`.
 *
 * See https://github.com/cloudflare/workerd/issues/7687
 */
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

/**
 * Bare specifier required by the patched runner. The plugin resolves it to the copied
 * `cache-components-scheduler` template, so the generated code carries no build machine paths.
 */
export const cacheComponentsSchedulerModule = "__opennext_cache_components_scheduler";

/**
 * Whether the staged runner must be replaced.
 *
 * The runner ships in every Next.js bundle, so only apps that enable Cache Components get the patch
 * and its build errors. Next.js 16.2 introduced `runInSequentialTasks`; earlier versions stage their
 * renders with different functions that this patch does not cover.
 */
export function needsCacheComponentsScheduler(buildOpts: BuildOptions, nextConfig: NextConfig): boolean {
	const config: CacheComponentsNextConfig = nextConfig;
	// The flag moved from `experimental.dynamicIO` to `experimental.cacheComponents` to a top level option.
	const enabled =
		config.cacheComponents ?? config.experimental?.cacheComponents ?? config.experimental?.dynamicIO;
	return Boolean(enabled) && !compareSemver(buildOpts.nextVersion, "<", "16.2.0");
}

// The runner is the only caller of this function, so its name identifies the files to patch.
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

	// `ContentUpdater` skips a callback whose filters match no file, which would ship the original runner.
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
				// Another plugin already failed the build, so do not bury its error under ours.
				if (result.errors.length === 0 && patchedFiles === 0) {
					throw new Error(
						`Cache Components is enabled but \`runInSequentialTasks\` was not found in Next.js ${buildOpts.nextVersion}. The app would render incomplete responses on Workers. Please report this to @opennextjs/cloudflare.`
					);
				}
			});
		},
	};
}

/**
 * Replaces the body of `runInSequentialTasks` with a call to the workerd implementation.
 *
 * @param code The code of a file that calls `DANGEROUSLY_runPendingImmediatesAfterCurrentTask`.
 * @param filePath The path of the file, for the error message.
 * @returns The patched code.
 * @throws When the file does not contain exactly one runner, as the app would then render incomplete responses.
 */
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
 * Matches the innermost function declaration that calls both immediate helpers. The minifier renames
 * the function and inlines its timer group, but both callees are properties of an external module and
 * keep their names.
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
