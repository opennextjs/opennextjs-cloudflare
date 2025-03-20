import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import { rule } from "./patch-depd-deprecations.js";

describe("patchDepdDeprecations", () => {
  test("patch", () => {
    const code = `
      function prepareObjectStackTrace(e,t){
        return t
      }
      function wrapfunction(fn,message){
        if(typeof fn!=="function"){
          throw new TypeError("argument fn must be a function")
        }
        var args=createArgumentsString(fn.length);
        var deprecate=this;
        var stack=getStack();
        var site=callSiteLocation(stack[1]);
        site.name=fn.name;
        var deprecatedfn=eval("(function ("+args+") {\\n"+'"use strict"\\n'+"log.call(deprecate, message, site)\\n"+"return fn.apply(this, arguments)\\n"+"})");
        return deprecatedfn;
      }`;

    expect(patchCode(code, rule)).toMatchInlineSnapshot(`
      "function prepareObjectStackTrace(e,t){
              return t
            }
            function wrapfunction(fn, message) { if(typeof fn !== 'function') throw new Error("argument fn must be a function"); return function deprecated_fn(...args) { console.warn(message); return fn(...args); } }"
    `);
  });
});
