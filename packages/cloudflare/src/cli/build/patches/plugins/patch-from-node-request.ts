/**
 * Patch for `next/dist/server/web/spec-extension/adapters/next-request.js`
 * https://github.com/vercel/next.js/blob/ea08bf27/packages/next/src/server/web/spec-extension/adapters/next-request.ts#L107-L125
 *
 * Patch fromNodeNextRequest to pass in the original request signal onto NextRequest
 *
 * Cloudflare Workers do now support this API. Read more about the release here:
 * https://developers.cloudflare.com/changelog/2025-05-22-handle-request-cancellation/
 *
 * TODO: test on latest Next 14
 *
 */

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export function patchFromNodeRequest(updater: ContentUpdater): Plugin {
	return updater.updateContent("from-node-request", [
		{
			filter: getCrossPlatformPathRegex(
				String.raw`next/dist/server/web/spec-extension/adapters/next-request.js`,
				{
					escape: false,
				}
			),
			versions: ">=15.0.0",
			contentFilter: /fromNodeNextRequest\(/,
			callback: ({ contents, path }) => {
				console.log(path);
				contents = patchCode(contents, signalIdentifierRuleUnbundled);
				contents = patchCode(contents, signalSpreadElement);
				return contents;
			},
		},
		{
			filter: getCrossPlatformPathRegex(String.raw`\.next/server/.*\.js$`, {
				escape: false,
			}),
			versions: ">=15.0.0",
			contentFilter: /fromNodeNextRequest\(/,
			callback: ({ contents, path }) => {
				console.log(path);
				contents = patchCode(contents, signalIdentifierRuleBundled);
				contents = patchCode(contents, signalSpreadElement);
				return contents;
			},
		},
	]);
}
/**
 * This didn't work for some reason
 */
export const signalIdentifierRuleUnbundled = `
rule:
  kind: shorthand_property_identifier
  regex: ^signal$
  inside:
    kind: object
    inside:
      kind: arguments
      has:
        regex: fromNodeOutgoingHttpHeaders
      inside:
        kind: new_expression
        has:
          regex: NextRequest
        inside:
          kind: return_statement
          inside:
            kind: statement_block
            inside:
              kind: method_definition
              inside:
                kind: class_body
                inside:
                  kind: class_declaration
fix:
  'signal: globalThis[Symbol.for("__cloudflare-context__")].abortSignal'
`;

export const signalSpreadElement = `
rule:
  pattern: 
    selector: member_expression
    context: "$A.aborted"
  inside:
    kind: ternary_expression
    inside:
      kind: spread_element
      inside:
        kind: object
        inside:
          kind: arguments
          inside:
            kind: new_expression
            has:
              kind: member_expression
              has:
                kind: property_identifier
                regex: NextRequest
            inside:
              kind: return_statement
              inside:
                kind: statement_block
                inside:
                  kind: method_definition
                  has:
                    field: name
                    regex: ^fromNodeNextRequest$
fix:
  globalThis[Symbol.for("__cloudflare-context__")].abortSignal.aborted
`;

export const signalIdentifierRuleBundled = `
rule:
  pattern: 
    selector: identifier
    context: "signal: $A"
  inside:
    kind: pair
    inside:
      kind: object
      inside:
        kind: arguments
        inside:
          kind: new_expression
          has:
            kind: member_expression
            has:
              kind: property_identifier
              regex: NextRequest
fix:
  globalThis[Symbol.for("__cloudflare-context__")].abortSignal
`;
