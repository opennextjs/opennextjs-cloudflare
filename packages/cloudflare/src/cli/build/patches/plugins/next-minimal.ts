import { patchCode } from "../ast/util.js";
import { ContentUpdater } from "./content-updater.js";

// We try to be as specific as possible to avoid patching the wrong thing here
// It seems that there is a bug in the worker runtime. When the AbortController is created outside of the request context it throws an error (not sure if it's expected or not) except in this case. https://github.com/cloudflare/workerd/issues/3657
// It fails while requiring the `app-page.runtime.prod.js` file, but instead of throwing an error, it just return an empty object for the `require('app-page.runtime.prod.js')` call which makes every request to an app router page fail.
// If it's a bug in workerd and it's not expected to throw an error, we can remove this patch.
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
// In next `renderHTML` is used as a fallback in case of errors, but in minimal mode it just throws the error and the responsability of handling it is on the infra.
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

export function patchNextMinimal(updater: ContentUpdater) {
  updater.updateContent(
    "patch-abortController-next15.2",
    { filter: /app-page(-experimental)?\.runtime\.prod\.js$/, contentFilter: /new AbortController/ },
    async ({ contents }) => {
      return patchCode(contents, abortControllerRule);
    }
  );

  updater.updateContent(
    "patch-next-minimal",
    { filter: /next-server\.(js)$/, contentFilter: /.*/ },
    async ({ contents }) => {
      return patchCode(contents, nextMinimalRule);
    }
  );

  return {
    name: "patch-abortController",
    setup() {},
  };
}
