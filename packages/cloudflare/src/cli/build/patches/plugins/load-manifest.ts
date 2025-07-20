/**
 * Inline `loadManifest` and `evalManifest` from `load-manifest.js`
 *
 * They rely on `readFileSync` that is not supported by workerd.
 */

import { readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode, type RuleConfig } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { glob } from "glob";

import { normalizePath } from "../../utils/normalize-path.js";

export function inlineLoadManifest(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
	return updater.updateContent("inline-load-manifest", [
		{
			field: {
				filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/load-manifest(\.external)?\.js$`, {
					escape: false,
				}),
				contentFilter: /function loadManifest\(/,
				callback: async ({ contents }) => {
					contents = await patchCode(contents, await getLoadManifestRule(buildOpts));
					contents = await patchCode(contents, await getEvalManifestRule(buildOpts));
					return contents;
				},
			},
		},
	]);
}

async function getLoadManifestRule(buildOpts: BuildOptions) {
	const { outputDir } = buildOpts;

	const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
	const dotNextDir = join(baseDir, ".next");

	const manifests = await glob(join(dotNextDir, "**/{*-manifest,required-server-files}.json"), {
		windowsPathsNoEscape: true,
	});

	const returnManifests = (
		await Promise.all(
			manifests.map(
				async (manifest) => `
if ($PATH.endsWith("${normalizePath("/" + relative(dotNextDir, manifest))}")) {
  return ${await readFile(manifest, "utf-8")};
}`
			)
		)
	).join("\n");

	return {
		rule: {
			pattern: `
function loadManifest($PATH, $$$ARGS) {
  $$$_
}`,
		},
		fix: `
function loadManifest($PATH, $$$ARGS) {
  $PATH = $PATH.replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)});
  if ($PATH === "/.next/BUILD_ID") {
  return process.env.NEXT_BUILD_ID;
	}
  ${returnManifests}
  throw new Error(\`Unexpected loadManifest(\${$PATH}) call!\`);
}`,
	} satisfies RuleConfig;
}

async function getEvalManifestRule(buildOpts: BuildOptions) {
	const { outputDir } = buildOpts;

	const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next");
	const appDir = join(baseDir, "server/app");
	const manifests = await glob(join(baseDir, "**/*_client-reference-manifest.js"), {
		windowsPathsNoEscape: true,
	});

	const returnManifests = manifests
		.map((manifest) => {
			const endsWith = normalizePath(relative(baseDir, manifest));
			const key = normalizePath("/" + relative(appDir, manifest)).replace(
				"_client-reference-manifest.js",
				""
			);
			return `
if ($PATH.endsWith("${endsWith}")) {
  require(${JSON.stringify(manifest)});
  return {
    __RSC_MANIFEST: {
    "${key}": globalThis.__RSC_MANIFEST["${key}"],
    },
  };
}`;
		})
		.join("\n");

	return {
		rule: {
			pattern: `
function evalManifest($PATH, $$$ARGS) {
  $$$_
}`,
		},
		fix: `
function evalManifest($PATH, $$$ARGS) {
  $PATH = $PATH.replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)});
  ${returnManifests}
  throw new Error(\`Unexpected evalManifest(\${$PATH}) call!\`);
}`,
	} satisfies RuleConfig;
}
