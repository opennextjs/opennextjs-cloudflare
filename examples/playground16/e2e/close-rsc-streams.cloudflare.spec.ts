import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

// Worker-only: Next dev does not build these artifacts. Both webpack and Turbopack run this spec.
const serverDir = path.join(__dirname, "../.open-next/server-functions/default");

function readServerBundle(): string {
	// Include both the root re-export and the actual handler in monorepo builds.
	const handlers = readdirSync(serverDir, { recursive: true }).filter(
		(entry) => path.basename(entry) === "handler.mjs"
	);
	expect(handlers.length).toBeGreaterThan(0);
	return handlers.map((handler) => readFileSync(path.join(serverDir, handler), "utf-8")).join("\n");
}

test("the RSC streams Next.js leaves open are closed in the server bundle", () => {
	const code = readServerBundle();

	// `createUnclosingStream`: `i<chunks.length&&controller.enqueue(chunks[i++])` never closes.
	// (Its closing twin `createClosingStream` is always there, so only the unclosed form is checked.)
	expect(code).not.toMatch(
		/[\w$]+\s*<\s*[\w$]+\.length\s*&&\s*[\w$]+\.enqueue\(\s*[\w$]+\[[\w$]+\+\+\]\s*\)/
	);

	// `createUnclosingPrefetchStream`: closes once the server stream is done.
	expect(code).not.toMatch(
		/await [\w$]+\.read\(\);\s*if\s*\(![\w$]+\)\s*\{[^}]*continue;?\s*\}\s*return;?\s*\}/
	);
	expect(code).toMatch(
		/await [\w$]+\.read\(\);\s*if\s*\(![\w$]+\)\s*\{[^}]*continue;?\s*\}\s*[\w$]+\.close\(\);/
	);

	// `pageDataStream` of `collectSegmentData` (Next.js 16.4+): closes after the last chunk.
	expect(code).toMatch(/[\w$]+\.enqueue\([\w$]+\.subarray\([\w$]+\)\)\s*,\s*[\w$]+\.close\(\)/);
});
