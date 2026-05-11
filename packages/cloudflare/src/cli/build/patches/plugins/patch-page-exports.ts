/**
 * Next.js 16.2.x Turbopack page templates set up exports on a CHILD module via
 * `esmExport(bindings, childId)`, then re-call esmExport for the entry module's
 * own id. The page entry point does `module.exports = R.m(entryId).exports`,
 * which only has the second call's vendored bindings (no `handler`), causing
 * "ComponentMod.handler is not a function" at request time.
 *
 * Fix: at build time, scan each app-page template chunk to find the
 * `entryId -> childId` mapping (the child module is where `handler` lives).
 * Then transform each `app/**\/page.js` and `app/**\/route.js` to merge the
 * child module's exports into `module.exports`.
 *
 * This patch ONLY modifies page.js/route.js files - it does NOT touch the
 * Turbopack runtime, esmExport, or instantiateModule. So it can't regress
 * instrumentation hook loading or app-page-turbo external module loading.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";

/**
 * Extracts the entry-module-id and handler-child-module-id from a single
 * app-page template chunk. Returns null if either anchor is missing.
 *
 * Exported for testing.
 */
export function parseEntryChildFromChunk(content: string): { entryId: string; childId: string } | null {
	// Entry module id: `module.exports=[<entryId>,a=>{...}]`
	const entryMatch = content.match(/module\.exports\s*=\s*\[(\d+)/);
	if (!entryMatch) return null;

	// Child module id with handler: `a.s([...,"handler",...], <childId>)`
	const handlerMatch = content.match(/a\.s\(\[[^\]]*"handler"[^\]]*\],\s*(\d+)\)/);
	if (!handlerMatch) return null;

	const entryId = entryMatch[1]!;
	const childId = handlerMatch[1]!;

	// Only record if child differs from entry (real delegation pattern)
	if (entryId === childId) return null;

	return { entryId, childId };
}

/**
 * Scans all SSR app-page template chunks and builds a map of
 * entry-module-id -> child-module-id (where the handler lives).
 */
function buildEntryChildMap(buildOpts: BuildOptions): Map<string, string> {
	const mapping = new Map<string, string>();
	const ssrChunksDir = path.join(
		buildOpts.outputDir,
		"server-functions/default",
		getPackagePath(buildOpts),
		".next/server/chunks/ssr"
	);

	if (!existsSync(ssrChunksDir)) {
		return mapping;
	}

	const templateRegex = /^0-e9_next_dist_esm_build_templates_app-page_.+\.js$/;
	for (const file of readdirSync(ssrChunksDir)) {
		if (!templateRegex.test(file)) continue;
		if (file.endsWith(".map")) continue;

		const content = readFileSync(path.join(ssrChunksDir, file), "utf8");
		const parsed = parseEntryChildFromChunk(content);
		if (parsed) {
			mapping.set(parsed.entryId, parsed.childId);
		}
	}

	return mapping;
}

/**
 * Transforms `module.exports=R.m(<entryId>).exports` to merge in the
 * child module's exports (which has the handler).
 *
 * Exported for testing.
 */
export function transformPageJs(contents: string, entryChildMap: Map<string, string>): string | null {
	// Match the standard page.js terminator: `module.exports=R.m(<entryId>).exports`
	const match = contents.match(/^(R\.m\((\d+)\)\s*)module\.exports\s*=\s*R\.m\(\d+\)\.exports\s*$/m);
	if (!match) return null;

	const entryId = match[2]!;
	const childId = entryChildMap.get(entryId);
	if (!childId) return null;

	// Replace with merge logic. R.m(entryId) populates moduleCache[childId] as a
	// side effect of esmExport(bindings, childId). R.m(childId) then returns the
	// child module that owns the `handler` export. We then merge the child's
	// own-property descriptors over the entry's (without overriding entry-only
	// properties), so the page module exposes both the entry's bindings and the
	// child's handler.
	const replacement = `R.m(${entryId})
module.exports=(function(){
  var _s=R.m(${entryId}).exports;
  if(typeof _s.handler==='function')return _s;
  var _c=R.m(${childId}).exports;
  var _r={};
  for(var _k of Object.getOwnPropertyNames(_s)){var _d=Object.getOwnPropertyDescriptor(_s,_k);if(_d)Object.defineProperty(_r,_k,_d);}
  for(var _k of Object.getOwnPropertyNames(_c)){var _d=Object.getOwnPropertyDescriptor(_c,_k);if(_d&&!Object.getOwnPropertyDescriptor(_r,_k))Object.defineProperty(_r,_k,_d);}
  return _r;
})()`;

	return contents.replace(match[0], replacement);
}

export function patchPageExports(_updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
	const entryChildMap = buildEntryChildMap(buildOpts);

	if (entryChildMap.size === 0) {
		return { name: "patch-page-exports", setup() {} };
	}

	return {
		name: "patch-page-exports",
		setup(build) {
			build.onLoad({ filter: /\.next[\\/]server[\\/]app[\\/].*[\\/](page|route)\.js$/ }, async (args) => {
				const contents = await readFile(args.path, "utf8");
				const transformed = transformPageJs(contents, entryChildMap);
				return {
					contents: transformed ?? contents,
					loader: "js",
				};
			});
		},
	};
}
