import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import { abortControllerRule } from "./next-minimal";

const appPageRuntimeProdJs = `let p = new AbortController;
async function h(e3, t3) {
  let { flightRouterState: r3, nextUrl: a2, prefetchKind: i2 } = t3, u2 = { [n2.hY]: "1", [n2.B]: encodeURIComponent(JSON.stringify(r3)) };
  i2 === o.ob.AUTO && (u2[n2._V] = "1"), a2 && (u2[n2.kO] = a2);
  try {
    var c2;
    let t4 = i2 ? i2 === o.ob.TEMPORARY ? "high" : "low" : "auto";
    "export" === process.env.__NEXT_CONFIG_OUTPUT && ((e3 = new URL(e3)).pathname.endsWith("/") ? e3.pathname += "index.txt" : e3.pathname += ".txt");
    let r4 = await m(e3, u2, t4, p.signal), a3 = d(r4.url), h2 = r4.redirected ? a3 : void 0, g = r4.headers.get("content-type") || "", v = !!(null == (c2 = r4.headers.get("vary")) ? void 0 : c2.includes(n2.kO)), b = !!r4.headers.get(n2.jc), S = r4.headers.get(n2.UK), _ = null !== S ? parseInt(S, 10) : -1, w = g.startsWith(n2.al);
    if ("export" !== process.env.__NEXT_CONFIG_OUTPUT || w || (w = g.startsWith("text/plain")), !w || !r4.ok || !r4.body)
      return e3.hash && (a3.hash = e3.hash), f(a3.toString());
    let k = b ? function(e4) {
      let t5 = e4.getReader();
      return new ReadableStream({ async pull(e5) {
        for (; ; ) {
          let { done: r5, value: n3 } = await t5.read();
          if (!r5) {
            e5.enqueue(n3);
            continue;
          }
          return;
        }
      } });
    }(r4.body) : r4.body, E = await y(k);
    if ((0, l.X)() !== E.b)
      return f(r4.url);
    return { flightData: (0, s.aj)(E.f), canonicalUrl: h2, couldBeIntercepted: v, prerendered: E.S, postponed: b, staleTime: _ };
  } catch (t4) {
    return p.signal.aborted || console.error("Failed to fetch RSC payload for " + e3 + ". Falling back to browser navigation.", t4), { flightData: e3.toString(), canonicalUrl: void 0, couldBeIntercepted: false, prerendered: false, postponed: false, staleTime: -1 };
  }
}
`;

describe("Abort controller", () => {
  test("minimal", () => {
    expect(patchCode(appPageRuntimeProdJs, abortControllerRule)).toBe(
      `let p = {signal:{aborted: false}};
async function h(e3, t3) {
  let { flightRouterState: r3, nextUrl: a2, prefetchKind: i2 } = t3, u2 = { [n2.hY]: "1", [n2.B]: encodeURIComponent(JSON.stringify(r3)) };
  i2 === o.ob.AUTO && (u2[n2._V] = "1"), a2 && (u2[n2.kO] = a2);
  try {
    var c2;
    let t4 = i2 ? i2 === o.ob.TEMPORARY ? "high" : "low" : "auto";
    "export" === process.env.__NEXT_CONFIG_OUTPUT && ((e3 = new URL(e3)).pathname.endsWith("/") ? e3.pathname += "index.txt" : e3.pathname += ".txt");
    let r4 = await m(e3, u2, t4, p.signal), a3 = d(r4.url), h2 = r4.redirected ? a3 : void 0, g = r4.headers.get("content-type") || "", v = !!(null == (c2 = r4.headers.get("vary")) ? void 0 : c2.includes(n2.kO)), b = !!r4.headers.get(n2.jc), S = r4.headers.get(n2.UK), _ = null !== S ? parseInt(S, 10) : -1, w = g.startsWith(n2.al);
    if ("export" !== process.env.__NEXT_CONFIG_OUTPUT || w || (w = g.startsWith("text/plain")), !w || !r4.ok || !r4.body)
      return e3.hash && (a3.hash = e3.hash), f(a3.toString());
    let k = b ? function(e4) {
      let t5 = e4.getReader();
      return new ReadableStream({ async pull(e5) {
        for (; ; ) {
          let { done: r5, value: n3 } = await t5.read();
          if (!r5) {
            e5.enqueue(n3);
            continue;
          }
          return;
        }
      } });
    }(r4.body) : r4.body, E = await y(k);
    if ((0, l.X)() !== E.b)
      return f(r4.url);
    return { flightData: (0, s.aj)(E.f), canonicalUrl: h2, couldBeIntercepted: v, prerendered: E.S, postponed: b, staleTime: _ };
  } catch (t4) {
    return p.signal.aborted || console.error("Failed to fetch RSC payload for " + e3 + ". Falling back to browser navigation.", t4), { flightData: e3.toString(), canonicalUrl: void 0, couldBeIntercepted: false, prerendered: false, postponed: false, staleTime: -1 };
  }
}
`
    );
  });
});
