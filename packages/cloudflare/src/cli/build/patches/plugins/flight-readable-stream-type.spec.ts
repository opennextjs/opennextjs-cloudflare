import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import { rule } from "./flight-readable-stream-type.js";

describe("patchFlightReadableStreamType", () => {
	test("removes type property", () => {
		const code = `
function tl(e,t,r){
  let n = t ? '<script nonce="">' : "<script>";
  return new ReadableStream({type: "bytes", start(e){ e.enqueue(n); }});
}
`;

		expect(patchCode(code, rule)).toMatchInlineSnapshot(
			`
      "function tl(e,t,r){
        let n = t ? '<script nonce="">' : "<script>";
        return new ReadableStream({start(e){ e.enqueue(n); }});
      }
      "
      `
		);
	});
});
