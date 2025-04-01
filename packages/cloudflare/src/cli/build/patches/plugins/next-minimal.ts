import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { ContentUpdater, type Plugin } from "@opennextjs/aws/plugins/content-updater.js";

// Remove an instantiation of `AbortController` from the runtime.
//
//  Solves https://github.com/cloudflare/workerd/issues/3657:
// - The `AbortController` is meant for the client side, but ends in the server code somehow.
//   That's why we can get ride of it. See https://github.com/vercel/next.js/pull/73975/files.
// - Top level instantiation of `AbortController` are not supported by workerd as of March, 2025.
//   See https://github.com/cloudflare/workerd/issues/3657
// - As Next code is not more executed at top level, we do not need to apply this patch
//   See https://github.com/opennextjs/opennextjs-cloudflare/pull/497
//
// We try to be as specific as possible to avoid patching the wrong thing here
export const abortControllerRule = `
rule:
  all:
    - kind: lexical_declaration
      pattern: let $VAR = new AbortController
    - precedes:
        kind: function_declaration
        stopBy: end
        has:
          kind: statement_block
          has:
            kind: try_statement
            has:
              kind: catch_clause
              has:
                kind: statement_block
                has:
                  kind: return_statement
                  all:
                    - has:
                        stopBy: end
                        kind: member_expression
                        pattern: $VAR.signal.aborted
                    - has:
                        stopBy: end
                        kind: call_expression
                        regex: console.error\\("Failed to fetch RSC payload for

fix:
  'let $VAR = {signal:{aborted: false}};'
`;

// This rule is used instead of defining `process.env.NEXT_MINIMAL` in the `esbuild config.
// Do we want to entirely replace these functions to reduce the bundle size?
// In next `renderHTML` is used as a fallback in case of errors, but in minimal mode it just throws the error and the responsibility of handling it is on the infra.
export const nextMinimalRule = `
rule:
  kind: member_expression
  pattern: process.env.NEXT_MINIMAL
  any:
    - inside:
        kind: parenthesized_expression
        stopBy: end
        inside:
          kind: if_statement
          any:
            - inside:
                kind: statement_block
                inside:
                  kind: method_definition
                  any:
                    - has: {kind: property_identifier, field: name, regex: runEdgeFunction}
                    - has: {kind: property_identifier, field: name, regex: runMiddleware}
                    - has: {kind: property_identifier, field: name, regex: imageOptimizer}
            - has:
                kind: statement_block
                has:
                  kind: expression_statement
                  pattern: res.statusCode = 400;
fix:
  'true'
`;

export function patchNextMinimal(updater: ContentUpdater): Plugin {
  return updater.updateContent("patch-next-minimal", [
    {
      field: {
        filter: /next-server\.(js)$/,
        contentFilter: /.*/,
        callback: ({ contents }) => {
          return patchCode(contents, nextMinimalRule);
        },
      },
    },
  ]);
}
