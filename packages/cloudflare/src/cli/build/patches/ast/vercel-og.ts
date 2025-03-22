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
 * @param root Root node.
 * @returns Results of applying the rule.
 */
export function patchVercelOgFallbackFont(root: SgNode) {
  return applyRule(vercelOgFallbackFontRule, root);
}
