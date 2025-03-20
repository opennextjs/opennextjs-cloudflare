import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { patchCode } from "../ast/util.js";
import { ContentUpdater } from "./content-updater.js";

export const rule = `
rule:
  kind: await_expression
  inside:
    kind: if_statement
    stopBy: end
    has:
      kind: parenthesized_expression
      has: { kind: property_identifier , stopBy: end, regex: trustHostHeader}
  has: 
    kind: call_expression
    all:
      - has: {kind: identifier, pattern: fetch}
      - has:
          kind: arguments
          all: 
            - has:
                kind: object
                all: 
                  - has:
                      kind: pair
                      all:
                        - has: {kind: property_identifier, regex: method }
                        - has: {kind: string, regex: 'HEAD'}
                  - has:
                      kind: pair
                      all:
                        - has: {kind: property_identifier, regex: headers}
                        - has: {kind: identifier, pattern: $HEADERS}
            - has:
                kind: template_string
                all:
                  - has:
                      kind: string_fragment
                      regex: https://
                  - has:
                      kind: template_substitution
                      all:
                        - has: { kind: identifier, stopBy: end, pattern: $REQ }
                        - has:
                            kind: property_identifier
                            regex: headers
                            stopBy: end
                        - has: 
                            kind: property_identifier
                            regex: host
                            stopBy: end
                  - has:
                      kind: template_substitution
                      pattern: $URL_PATH
                      has:
                        kind: identifier
                      
fix: await (await import("@opennextjs/cloudflare")).getCloudflareContext().env.NEXT_CACHE_REVALIDATION_WORKER.fetch(\`\${$REQ.headers.host.includes("localhost") ? "http":"https" }://\${$REQ.headers.host}$URL_PATH\`,{method:'HEAD', headers:$HEADERS})
`

export function patchResRevalidate(updater: ContentUpdater) {
  return updater.updateContent(
    "patch-res-revalidate",
    {
      filter: getCrossPlatformPathRegex(
        String.raw`(pages-api\.runtime\.prod\.js|api-resolver\.js)$`,
        { escape: false }
      ),
      contentFilter: /\.trustHostHeader/,
    },
    ({ contents }) => patchCode(contents, rule)
  );
}