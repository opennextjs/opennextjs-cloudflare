import { applyRule, SgNode } from "@opennextjs/aws/build/patch/astCodePatcher.js";

export const vercelOgImportRule = `
rule:
  pattern: $NODE
  kind: string
  regex: "next/dist/compiled/@vercel/og/index\\\\.node\\\\.js"
inside:
  kind: arguments
  inside:
    kind: call_expression
    stopBy: end
    has:
      field: function
      regex: "import"

fix: |-
  "next/dist/compiled/@vercel/og/index.edge.js"
`;

/**
 * Patches Node.js imports for the library to be Edge imports.
 *
 * @param root Root node.
 * @returns Results of applying the rule.
 */
export function patchVercelOgImport(root: SgNode) {
	return applyRule(vercelOgImportRule, root);
}

export const vercelOgFallbackFontRule = `
rule:
  kind: variable_declaration
  all:
    - has:
        kind: variable_declarator
        has:
          kind: identifier
          regex: ^fallbackFont$
    - has:
        kind: call_expression
        pattern: fetch(new URL("$PATH", $$$REST))
        stopBy: end

fix: |-
  async function getFallbackFont() {
    // .bin is used so that a loader does not need to be configured for .ttf files
    return (await import("$PATH.bin")).default;
  }

  var fallbackFont = getFallbackFont();
`;

/**
 * Patches the default font fetching to use a .bin import.
 *
 * We use `.bin` extension as they are added as modules in the wrangler bundler.
 * We would need to add a rule to handle `.ttf` otherwise.
 *
 * @param root Root node.
 * @returns Results of applying the rule.
 */
export function patchVercelOgFallbackFont(root: SgNode) {
	return applyRule(vercelOgFallbackFontRule, root);
}

/**
 * Patches absolute @vercel/og wasm imports back to local relative imports.
 *
 * Next.js 16.2 emits absolute `yoga.wasm?module` imports in `index.edge.js`.
 * Wrangler later treats those module specifiers as relative to the worker entry,
 * producing a doubled path and an ENOENT during deploy.
 *
 * @param root Root node.
 * @returns Patched code.
 */
export function patchVercelOgWasmImport(code: string) {
	return code.replaceAll(
		/import\("([^"]*\/next\/dist\/compiled\/@vercel\/og\/([^"/]+\.wasm\?module))"\)/g,
		'import("./$2")'
	);
}
