/**
 * This patch will remove the `type: "bytes"` option from the `ReadableStream` constructor in the
 * createInlinedDataReadableStream function, which provides inline script tag chunks for writing hydration data to the client.
 * Since workerd has no enough support for the `bytes` type, this patch will remove it to avoid errors related to RSC Flight streams.
 */

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export const patchFlightReadableStreamType: CodePatcher = {
	name: "patch-flight-readable-stream-type",
	patches: [
		{
			pathFilter: getCrossPlatformPathRegex(String.raw`next-server/.*\.runtime\.prod\.js$`, {
				escape: false,
			}),
			contentFilter: /new ReadableStream\(\{type:"bytes",/,
			patchCode: async ({ code }) => patchCode(code, rule),
		},
	],
};

export const rule = `
rule:
  kind: object
  pattern: "{ type: \\"bytes\\", $$$REST }"
  inside:
    stopBy: end
    kind: new_expression
    has:
      field: constructor
      pattern: ReadableStream
    inside:
      kind: function_declaration
      stopBy: end
      has:
        regex: "<script>"

fix: "{$$$REST}"
`;
