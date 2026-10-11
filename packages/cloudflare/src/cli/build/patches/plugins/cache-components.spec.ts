import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import type { NextConfig } from "@opennextjs/aws/types/next-types.js";
import { describe, expect, test, vi } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import {
	cacheComponentsSchedulerModule,
	needsCacheComponentsScheduler,
	patchCacheComponents,
	patchRunInSequentialTasks,
	runInSequentialTasksRule,
	runnerFileFilter,
} from "./cache-components.js";

// `next/dist/server/app-render/app-render-render-utils.js` from Next.js 16.3, without the comments.
const runner = `function noop() {}
function runInSequentialTasks(first, ...rest) {
    return new Promise((resolve, reject)=>{
        const scheduleTimeout = (0, _apprenderscheduling.createAtomicTimerGroup)();
        const ids = [];
        let result;
        ids.push(scheduleTimeout(()=>{
            try {
                (0, _fastsetimmediateexternal.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
                result = first();
                if ((0, _isthenable.isThenable)(result)) {
                    result.then(noop, noop);
                }
            } catch (err) {
                reject(err);
            }
        }));
        ids.push(scheduleTimeout(()=>{
            try {
                (0, _fastsetimmediateexternal.expectNoPendingImmediates)();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        }));
    });
}`;

// Next.js 16.1 staged its renders with two functions that have another signature.
const next161Runners = `function scheduleInSequentialTasks(render, followup) {
    (0, _fastsetimmediateexternal.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
    (0, _fastsetimmediateexternal.expectNoPendingImmediates)();
}
function pipelineInSequentialTasks(one, two, three) {
    (0, _fastsetimmediateexternal.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
    (0, _fastsetimmediateexternal.expectNoPendingImmediates)();
}`;

function buildOptsFor(nextVersion: string): BuildOptions {
	return { nextVersion, outputDir: "/output" } as BuildOptions;
}

type PluginHarness = {
	onEnd: (result: { errors: unknown[] }) => void;
	resolve: (specifier: string) => { path: string } | undefined;
};

/** Captures the esbuild callbacks that the plugin registers. */
function setupPlugin(plugin: ReturnType<typeof patchCacheComponents>): PluginHarness {
	const resolvers: Array<[RegExp, (args: { path: string }) => { path: string }]> = [];
	let onEnd: PluginHarness["onEnd"] = () => {};

	plugin.setup({
		onEnd: (callback: PluginHarness["onEnd"]) => (onEnd = callback),
		onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string }) =>
			resolvers.push([options.filter, callback]),
	} as never);

	return {
		onEnd: (result) => onEnd(result),
		resolve: (specifier) => resolvers.find(([filter]) => filter.test(specifier))?.[1]({ path: specifier }),
	};
}

describe("runInSequentialTasks patch", () => {
	test("replaces the runner with the workerd implementation", () => {
		expect(computePatchDiff("app-render-render-utils.js", runner, runInSequentialTasksRule))
			.toMatchInlineSnapshot(`
				"Index: app-render-render-utils.js
				===================================================================
				--- app-render-render-utils.js
				+++ app-render-render-utils.js
				@@ -1,27 +1,4 @@
				 function noop() {}
				 function runInSequentialTasks(first, ...rest) {
				-    return new Promise((resolve, reject)=>{
				-        const scheduleTimeout = (0, _apprenderscheduling.createAtomicTimerGroup)();
				-        const ids = [];
				-        let result;
				-        ids.push(scheduleTimeout(()=>{
				-            try {
				-                (0, _fastsetimmediateexternal.DANGEROUSLY_runPendingImmediatesAfterCurrentTask)();
				-                result = first();
				-                if ((0, _isthenable.isThenable)(result)) {
				-                    result.then(noop, noop);
				-                }
				-            } catch (err) {
				-                reject(err);
				-            }
				-        }));
				-        ids.push(scheduleTimeout(()=>{
				-            try {
				-                (0, _fastsetimmediateexternal.expectNoPendingImmediates)();
				-                resolve(result);
				-            } catch (err) {
				-                reject(err);
				-            }
				-        }));
				-    });
				+  return require("__opennext_cache_components_scheduler").runInSequentialTasks(first, ...rest);
				 }
				\\ No newline at end of file
				"
			`);
	});

	// The minifier renames the runner and inlines its timer group.
	test.each(["next-16.2.12-app-page-turbo.runtime.prod.txt", "next-16.4.0-app-page.runtime.prod.txt"])(
		"replaces the minified runner of %s",
		(fixture) => {
			const code = readFileSync(new URL(`./fixtures/cache-components/${fixture}`, import.meta.url), "utf8");
			const patched = patchRunInSequentialTasks(code, fixture);

			expect(patched).toMatch(
				/function \w+\(first, \.\.\.rest\) \{\s+return require\("__opennext_cache_components_scheduler"\)\.runInSequentialTasks\(first, \.\.\.rest\);\s+\}/
			);
			expect(patched).not.toContain("DANGEROUSLY_runPendingImmediatesAfterCurrentTask");
			expect(patched).not.toContain("expectNoPendingImmediates");
		}
	);

	// The original runner would stay in the bundle, and the app would render incomplete responses.
	test.each([
		["no runner", "function other() { return 1; }", /found 0/],
		["the runners of Next.js 16.1", next161Runners, /found 2/],
	])("fails on a file with %s", (_, code, message) => {
		expect(() => patchRunInSequentialTasks(code, "app-page.runtime.prod.js")).toThrow(message);
	});

	test.each([
		"/next/dist/compiled/next-server/app-page.runtime.prod.js",
		"/next/dist/compiled/next-server/app-page-experimental.runtime.prod.js",
		"/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",
		"/next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js",
		"/app/.next/server/chunks/ssr/[root-of-the-server]__abc._.js",
		"/app/.next/server/chunks/214.js",
		"/next/dist/server/app-render/app-render-render-utils.js",
		"/next/dist/esm/server/app-render/app-render-render-utils.js",
	])("targets %s", (filePath) => {
		expect(runnerFileFilter.test(filePath)).toBe(true);
	});

	// This module defines the functions that the runner calls, so it passes the content filter.
	test("does not target the module that defines the immediate helpers", () => {
		expect(
			runnerFileFilter.test("/next/dist/server/node-environment-extensions/fast-set-immediate.external.js")
		).toBe(false);
	});
});

describe("patchCacheComponents", () => {
	test.each([
		[{ cacheComponents: true }, "16.2.0", true],
		[{ cacheComponents: true }, "16.4.0", true],
		[{ experimental: { cacheComponents: true } }, "16.2.0", true],
		[{ experimental: { dynamicIO: true } }, "16.2.0", true],
		// Next.js 16.1 has no `runInSequentialTasks`.
		[{ cacheComponents: true }, "16.1.6", false],
		[{ experimental: { dynamicIO: true } }, "15.5.27", false],
		[{ experimental: { ppr: true } }, "16.4.0", false],
		[{}, "16.4.0", false],
	] as const)("needs the scheduler for %j on Next.js %s: %s", (nextConfig, nextVersion, expected) => {
		expect(needsCacheComponentsScheduler(buildOptsFor(nextVersion), nextConfig as NextConfig)).toBe(expected);
	});

	// The runner ships in every Next.js bundle. An app without Cache Components must not get a build
	// error when Next.js changes it.
	test("registers nothing when the app does not use Cache Components", () => {
		const updater = { updateContent: vi.fn() } as unknown as ContentUpdater;
		const plugin = patchCacheComponents(updater, buildOptsFor("16.4.0"), {} as NextConfig);

		expect(updater.updateContent).not.toHaveBeenCalled();
		expect(() => setupPlugin(plugin).onEnd({ errors: [] })).not.toThrow();
	});

	test("fails the build when no file was patched", () => {
		const updater = { updateContent: vi.fn() } as unknown as ContentUpdater;
		const plugin = patchCacheComponents(updater, buildOptsFor("16.4.0"), {
			cacheComponents: true,
		} as NextConfig);
		const { onEnd } = setupPlugin(plugin);

		expect(() => onEnd({ errors: [] })).toThrow(/`runInSequentialTasks` was not found in Next.js 16.4.0/);
		// A build that already failed keeps its own error.
		expect(() => onEnd({ errors: [{ text: "something else broke" }] })).not.toThrow();
	});

	test("passes the build when a file was patched", async () => {
		const updateContent = vi.fn();
		const plugin = patchCacheComponents(
			{ updateContent } as unknown as ContentUpdater,
			buildOptsFor("16.4.0"),
			{ cacheComponents: true } as NextConfig
		);
		const [{ callback }] = updateContent.mock.calls[0]![1] as [
			{ callback: (args: { contents: string; path: string }) => Promise<string> },
		];

		await callback({ contents: runner, path: "app-render-render-utils.js" });

		expect(() => setupPlugin(plugin).onEnd({ errors: [] })).not.toThrow();
	});

	// The generated `require` must resolve to the scheduler of the adapter, not to a missing package.
	test("resolves the scheduler module to the copied template", () => {
		const plugin = patchCacheComponents(
			{ updateContent: vi.fn() } as unknown as ContentUpdater,
			buildOptsFor("16.4.0"),
			{ cacheComponents: true } as NextConfig
		);

		expect(setupPlugin(plugin).resolve(cacheComponentsSchedulerModule)?.path).toBe(
			join("/output", "cloudflare-templates/cache-components-scheduler.js")
		);
	});
});
