/**
 * Inline `loadManifest` and `evalManifest` from `load-manifest.js`
 *
 * They rely on `readFileSync` that is not supported by workerd.
 */

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

import { Lang, parse, type SgNode } from "@ast-grep/napi";
import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { applyRule, patchCode, type RuleConfig } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { glob } from "glob";

import { normalizePath } from "../../../utils/normalize-path.js";

export function inlineLoadManifest(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
	return updater.updateContent("inline-load-manifest", [
		{
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
	]);
}

async function getLoadManifestRule(buildOpts: BuildOptions) {
	const { outputDir } = buildOpts;

	const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
	const dotNextDir = join(baseDir, ".next");

	const manifests = await glob(
		join(dotNextDir, "**/{*-manifest,required-server-files,prefetch-hints}.json"),
		{
			windowsPathsNoEscape: true,
		}
	);

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
  if ($PATH.endsWith(".next/BUILD_ID")) {
    return process.env.NEXT_BUILD_ID;
	}
  ${returnManifests}
  // Known optional manifests \u2014 Next.js loads these with handleMissing: true
  // (see vercel/next.js packages/next/src/server/route-modules/route-module.ts).
  // Return {} to match Next.js behaviour instead of crashing the worker.
  // Note: Some manifest constants in Next.js omit the .json extension
  // (e.g. SUBRESOURCE_INTEGRITY_MANIFEST, DYNAMIC_CSS_MANIFEST), so we
  // strip .json before matching to handle both forms.
  {
    const p = $PATH.replace(/\\.json$/, "");
    if (p.endsWith("react-loadable-manifest") ||
        p.endsWith("subresource-integrity-manifest") ||
        p.endsWith("server-reference-manifest") ||
        p.endsWith("dynamic-css-manifest") ||
        p.endsWith("fallback-build-manifest") ||
        p.endsWith("prefetch-hints")) {
      return {};
    }
  }
  throw new Error(\`Unexpected loadManifest(\${$PATH}) call!\`);
}`,
	} satisfies RuleConfig;
}

async function getEvalManifestRule(buildOpts: BuildOptions) {
	const { outputDir } = buildOpts;

	const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next");
	const appDir = join(baseDir, "server/app");
	const manifestPaths = await glob(join(baseDir, "**/*_client-reference-manifest.js"), {
		windowsPathsNoEscape: true,
	});

	// Map of factored large objects (variable name -> {...})
	const factoredObjects = new Map<string, string>();
	// Map of manifest path -> factored manifest content
	const factoredManifest = new Map<string, string>();
	// Shared map of short hash prefix -> full SHA1 hash, used for collision resolution.
	const prefixMap = new Map<string, string>();

	for (const path of manifestPaths) {
		if (path.endsWith("page_client-reference-manifest.js")) {
			// `page_client-reference-manifest.js` files could contain large repeated values.
			// Factor out large values into separate variables to reduce the overall size of the generated code.
			let manifest = await readFile(path, "utf-8");
			for (const key of [
				"clientModules",
				"ssrModuleMapping",
				"edgeSSRModuleMapping",
				"rscModuleMapping",
				"entryCSSFiles",
				"entryJSFiles",
			]) {
				manifest = factorManifestValue(manifest, key, factoredObjects, prefixMap);
			}
			factoredManifest.set(path, manifest);
		}
	}

	// Map of factored values in an object
	const factoredValues = new Map<string, string>();

	for (const [varName, value] of factoredObjects) {
		factoredObjects.set(varName, factorObjectValues(value, factoredValues, prefixMap));
	}

	// Prepend chunks variable declarations before the factored values
	const factoredValueCode = [...factoredValues.entries()]
		.map(([name, val]) => `const ${name} = ${val};`)
		.join("\n");

	const factoredObjectCode = [...factoredObjects.entries()]
		.map(([varName, value]) => `const ${varName} = ${value};`)
		.join("\n");

	const returnManifests = manifestPaths
		// Sort by path length descending so longer (more specific) paths match first,
		// preventing suffix collisions in the `.endsWith()` chain (see #1156).
		.toSorted((a, b) => b.length - a.length)
		.map((path) => {
			let manifest: string;

			if (factoredManifest.has(path)) {
				manifest = factoredManifest.get(path)!;
			} else {
				manifest = `require(${JSON.stringify(path)});`;
			}

			const endsWith = normalizePath(relative(baseDir, path));
			const key = normalizePath("/" + relative(appDir, path)).replace("_client-reference-manifest.js", "");
			return `
if ($PATH.endsWith("${endsWith}")) {
  ${manifest}
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
${factoredValueCode}
${factoredObjectCode}

function evalManifest($PATH, $$$ARGS) {
  $PATH = $PATH.replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)});
  ${returnManifests}
  // client-reference-manifest is optional for static metadata routes
  // (see vercel/next.js route-module.ts, loaded with handleMissing: true)
  if ($PATH.endsWith("_client-reference-manifest.js")) {
    return { __RSC_MANIFEST: {} };
  }
  throw new Error(\`Unexpected evalManifest(\${$PATH}) call!\`);
}`,
	} satisfies RuleConfig;
}

/**
 * Factor out large manifest values into separate variables.
 *
 * @param manifest The manifest code.
 * @param key The key to factor out.
 * @param values A map to store the factored values (indexed by variable name).
 * @param prefixMap Map of short hash prefix → full hash, updated in place for
 *   collision resolution across calls.
 * @returns The manifest code with large values factored out.
 */
export function factorManifestValue(
	manifest: string,
	key: string,
	values: Map<string, string>,
	prefixMap: Map<string, string>
): string {
	const valueName = "VALUE";
	// ASTGrep rule to extract the value of a specific key from the manifest object in the evalManifest function.
	//
	// globalThis.__RSC_MANIFEST["/path/to/page"] = {
	//  // ...
	//  key: $VALUE
	//  // ...
	// }
	const extractValueRule = `
rule:
  kind: pair
  all:
    - has:
        field: key
        pattern: '"${key}"'
    - has:
        field: value
        pattern: $${valueName}
inside:
  pattern: globalThis.__RSC_MANIFEST[$$$_] = { $$$ };
  stopBy: end
`;

	const rootNode = parse(Lang.JavaScript, manifest).root();
	const { matches } = applyRule(extractValueRule, rootNode, { once: true });
	if (matches.length === 1 && matches[0]?.getMatch(valueName)) {
		const match = matches[0];
		const value = match.getMatch(valueName)!.text();
		if (value.length > 30) {
			// Factor out large values into separate variables.
			const varName = getOrCreateVarName(value, prefixMap);
			values.set(varName, value);
			// Replace the value in the manifest with the variable reference.
			return rootNode.commitEdits([match.replace(`"${key}": ${varName}`)]);
		}
	}

	// Return the original manifest if the value is not found or is small enough to not warrant factoring out.
	return manifest;
}

/**
 * Factor out large object values into separate variables.
 *
 * @param valueText The JS source text of the module mapping object.
 * @param sharedVars Map to accumulate shared variable declarations.
 * @param prefixMap Map of short hash prefix → full hash, updated in place for
 *   collision resolution across calls.
 * @returns The rewritten value text with chunks arrays replaced by variable refs.
 */
export function factorObjectValues(
	valueText: string,
	sharedVars: Map<string, string>,
	prefixMap: Map<string, string>
): string {
	const rootNode = parse(Lang.JavaScript, valueText).root();

	// Find all "chunks": [...] pairs
	const chunksRule = `
rule:
  kind: pair
  all:
    - has:
        field: key
        pattern: '"chunks"'
    - has:
        field: value
        kind: array
        pattern: $CHUNKS
`;

	const { matches } = applyRule(chunksRule, rootNode, { once: false });

	const edits: Array<{ match: SgNode; replacement: string }> = [];

	for (const match of matches) {
		const chunksNode = match.getMatch("CHUNKS");
		if (!chunksNode) continue;
		const chunksText = chunksNode.text();
		if (chunksText.length <= 30) continue; // Skip small arrays

		const varName = getOrCreateVarName(chunksText, prefixMap);
		sharedVars.set(varName, chunksText);
		edits.push({ match, replacement: `"chunks": ${varName}` });
	}

	return edits.length === 0
		? valueText
		: rootNode.commitEdits(edits.map((e) => e.match.replace(e.replacement)));
}

/** Minimum number of hex characters used for short hash prefixes. */
const MIN_PREFIX_LENGTH = 3;

/**
 * Get or create a short variable name for a value, resolving collisions.
 *
 * Computes a SHA1 hash of the value, then finds the shortest unique prefix
 * (minimum {@link MIN_PREFIX_LENGTH} hex chars). When a new hash collides with
 * an existing prefix, the new entry is given a longer prefix — existing entries
 * are never renamed.
 *
 * @param value The value to hash.
 * @param prefixMap Map of short prefix → full hash, updated in place.
 * @returns The variable name (`v<shortPrefix>`).
 */
export function getOrCreateVarName(value: string, prefixMap: Map<string, string>): string {
	const sha1 = crypto.createHash("sha1").update(value).digest("hex");

	// Find the shortest prefix (>= MIN_PREFIX_LENGTH) that doesn't collide
	// with any existing prefix. Only the new entry is lengthened.
	for (let len = MIN_PREFIX_LENGTH; len <= sha1.length; len++) {
		const candidate = sha1.slice(0, len);
		const existing = prefixMap.get(candidate);
		if (existing === undefined) {
			prefixMap.set(candidate, sha1);
			return `v${candidate}`;
		}
		if (existing === sha1) {
			// Same content seen again — reuse the existing variable.
			return `v${candidate}`;
		}
		// A different hash occupies this exact prefix — lengthen and retry.
	}

	// Unreachable: two different SHA1 hashes always diverge before 40 chars.
	throw new Error("Failed to find a unique prefix");
}
