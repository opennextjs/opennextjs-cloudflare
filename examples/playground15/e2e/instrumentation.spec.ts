import { test, expect } from "@playwright/test";
import { describe } from "node:test";

test.describe("instrumentation", () => {
  test("the instrumentation register hook should work for the nodejs runtime", async ({ page }) => {
    const res = await page.request.get("/api/instrumentation");
    const respJson: Record<string, string> = await res.json();
    expect(respJson["nodejs-instrumentation-setup"]).toEqual(
      "this value has been set by calling the instrumentation `register` callback in the nodejs runtime"
    );
  });

  test("the instrumentation register hook should work for the edge runtime", async ({ page }) => {
    const res = await page.request.get("/middleware-instrumentation");
    const respJson: Record<string, string> = await res.json();
    expect(respJson["edge-instrumentation-setup"]).toEqual(
      "this value has been set by calling the instrumentation `register` callback in the edge runtime"
    );
  });

  // Note: we cannot test this since currently both runtimes share the same global scope
  //       (see: https://github.com/opennextjs/opennextjs-cloudflare/issues/408)
  describe.skip("isolation", () => {
    test("the instrumentation register hook nodejs logic should not effect edge routes", async ({ page }) => {
      const res = await page.request.get("/middleware-instrumentation");
      const respJson: Record<string, string> = await res.json();
      expect(respJson["nodejs-instrumentation-setup"]).toBeUndefined();
    });

    test("the instrumentation register hook edge logic should not effect nodejs routes", async ({ page }) => {
      const res = await page.request.get("/api/instrumentation");
      const respJson: Record<string, string> = await res.json();
      expect(respJson["edge-instrumentation-setup"]).toBeUndefined();
    });
  });
});
