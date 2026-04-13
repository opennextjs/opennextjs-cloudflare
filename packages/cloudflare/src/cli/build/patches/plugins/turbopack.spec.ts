import { describe, expect, test } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";

// Re-export the rule for testing (it's not exported from turbopack.ts, so we inline it here)
const inlineExternalImportRule = `
rule:
  pattern: "$RAW = await import($ID)"
  inside:
    regex: "externalImport"
    kind: function_declaration
    stopBy: end
fix: |-
  switch ($ID) {
    case "next/dist/compiled/@vercel/og/index.node.js":
      $RAW = await import("next/dist/compiled/@vercel/og/index.edge.js");
      break;
    default: {
      // Turbopack hashes external package IDs: e.g. "shiki-43d062b67f27bbdc/core"
      // Strip the hash suffix to recover the real package name, then use require().
      const __dehashedId = $ID.replace(/^((?:@[^/]+\\/)?[^/]+?)-[0-9a-f]{16,}(\\/[^]*)?$/, "$1$2");
      if (__dehashedId !== $ID) {
        $RAW = require(__dehashedId || $ID);
      } else {
        $RAW = await import($ID);
      }
    }
  }
`;

const externalImportFn = `
async function externalImport(id) {
    let raw;
    try {
        raw = await import(id);
    } catch (err) {
        throw new Error(\`Failed to load external module \${id}: \${err}\`);
    }
    return raw;
}
`;

describe("patchTurbopackRuntime - inlineExternalImportRule", () => {
	test("patches externalImport to handle @vercel/og node → edge redirect", () => {
		const diff = computePatchDiff("turbopack_runtime.js", externalImportFn, inlineExternalImportRule);
		expect(diff).toMatchSnapshot();
		expect(diff).toContain("next/dist/compiled/@vercel/og/index.edge.js");
	});

	test("patches externalImport to include hashed module ID dehashing", () => {
		const diff = computePatchDiff("turbopack_runtime.js", externalImportFn, inlineExternalImportRule);
		expect(diff).toContain("__dehashedId");
		expect(diff).toContain("[0-9a-f]{16,}");
	});

	test("generated dehash regex correctly maps shiki hashed IDs to real package names", () => {
		const re = /^((?:@[^/]+\/)?[^/]+?)-[0-9a-f]{16,}(\/[^]*)?$/;

		expect("shiki-43d062b67f27bbdc".replace(re, "$1$2")).toBe("shiki");
		expect("shiki-43d062b67f27bbdc/core".replace(re, "$1$2")).toBe("shiki/core");
		expect("shiki-43d062b67f27bbdc/wasm".replace(re, "$1$2")).toBe("shiki/wasm");
	});

	test("generated dehash regex does not match normal module IDs", () => {
		const re = /^((?:@[^/]+\/)?[^/]+?)-[0-9a-f]{16,}(\/[^]*)?$/;

		// Should not match — no hex suffix
		expect("shiki".replace(re, "$1$2")).toBe("shiki");
		expect("react".replace(re, "$1$2")).toBe("react");
		expect("next/dist/compiled/@vercel/og/index.node.js".replace(re, "$1$2")).toBe(
			"next/dist/compiled/@vercel/og/index.node.js"
		);
		// Too short to be a hash (< 16 hex chars)
		expect("pkg-abc123".replace(re, "$1$2")).toBe("pkg-abc123");
	});

	test("generated dehash regex handles scoped packages", () => {
		const re = /^((?:@[^/]+\/)?[^/]+?)-[0-9a-f]{16,}(\/[^]*)?$/;

		expect("@shikijs/core-43d062b67f27bbdc".replace(re, "$1$2")).toBe("@shikijs/core");
		expect("@shikijs/core-43d062b67f27bbdc/dist/index.js".replace(re, "$1$2")).toBe(
			"@shikijs/core/dist/index.js"
		);
	});
});
