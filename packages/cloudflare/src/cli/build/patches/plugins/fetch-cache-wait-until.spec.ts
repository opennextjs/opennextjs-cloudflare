import { describe, expect, test } from "vitest";

import { patchCode } from "../ast/util.js";
import { rule } from "./fetch-cache-wait-until.js";

describe("patchFetchCacheSetMissingWaitUntil", () => {
  test("on minified code", () => {
    const code = `
{
  let [o4, a2] = (0, d2.cloneResponse)(e3);
  return o4.arrayBuffer().then(async (e4) => {
    var a3;
    let i4 = Buffer.from(e4), s3 = { headers: Object.fromEntries(o4.headers.entries()), body: i4.toString("base64"), status: o4.status, url: o4.url };
    null == $ || null == (a3 = $.serverComponentsHmrCache) || a3.set(n2, s3), F && await H.set(n2, { kind: c2.CachedRouteKind.FETCH, data: s3, revalidate: t5 }, { fetchCache: true, revalidate: r4, fetchUrl: _, fetchIdx: q, tags: A2 });
  }).catch((e4) => console.warn("Failed to set fetch cache", u4, e4)).finally(X), a2;
}`;

    expect(patchCode(code, rule)).toMatchInlineSnapshot(`
      "{
        let [o4, a2] = (0, d2.cloneResponse)(e3);
        globalThis.__openNextAls?.getStore()?.waitUntil?.(o4.arrayBuffer().then(async (e4) => {
          var a3;
          let i4 = Buffer.from(e4), s3 = { headers: Object.fromEntries(o4.headers.entries()), body: i4.toString("base64"), status: o4.status, url: o4.url };
          null == $ || null == (a3 = $.serverComponentsHmrCache) || a3.set(n2, s3), F && await H.set(n2, { kind: c2.CachedRouteKind.FETCH, data: s3, revalidate: t5 }, { fetchCache: true, revalidate: r4, fetchUrl: _, fetchIdx: q, tags: A2 });
        }).catch((e4) => console.warn("Failed to set fetch cache", u4, e4)).finally(X));
      return a2;

      }"
    `);
  });

  test("on non-minified code", () => {
    const code = `
      // We're cloning the response using this utility because there
      // exists a bug in the undici library around response cloning.
      // See the following pull request for more details:
      // https://github.com/vercel/next.js/pull/73274
      const [cloned1, cloned2] = (0, _cloneresponse.cloneResponse)(res);
      // We are dynamically rendering including dev mode. We want to return
      // the response to the caller as soon as possible because it might stream
      // over a very long time.
      cloned1.arrayBuffer().then(async (arrayBuffer)=>{
          var _requestStore_serverComponentsHmrCache;
          const bodyBuffer = Buffer.from(arrayBuffer);
          const fetchedData = {
              headers: Object.fromEntries(cloned1.headers.entries()),
              body: bodyBuffer.toString('base64'),
              status: cloned1.status,
              url: cloned1.url
          };
          requestStore == null ? void 0 : (_requestStore_serverComponentsHmrCache = requestStore.serverComponentsHmrCache) == null ? void 0 : _requestStore_serverComponentsHmrCache.set(cacheKey, fetchedData);
          if (isCacheableRevalidate) {
              await incrementalCache.set(cacheKey, {
                  kind: _responsecache.CachedRouteKind.FETCH,
                  data: fetchedData,
                  revalidate: normalizedRevalidate
              }, {
                  fetchCache: true,
                  revalidate: externalRevalidate,
                  fetchUrl,
                  fetchIdx,
                  tags
              });
          }
      }).catch((error)=>console.warn(\`Failed to set fetch cache\`, input, error)).finally(handleUnlock);
      return cloned2;
    `;

    expect(patchCode(code, rule)).toMatchInlineSnapshot(`
      "// We're cloning the response using this utility because there
            // exists a bug in the undici library around response cloning.
            // See the following pull request for more details:
            // https://github.com/vercel/next.js/pull/73274
            const [cloned1, cloned2] = (0, _cloneresponse.cloneResponse)(res);
            // We are dynamically rendering including dev mode. We want to return
            // the response to the caller as soon as possible because it might stream
            // over a very long time.
            globalThis.__openNextAls?.getStore()?.waitUntil?.(cloned1.arrayBuffer().then(async (arrayBuffer)=>{
                var _requestStore_serverComponentsHmrCache;
                const bodyBuffer = Buffer.from(arrayBuffer);
                const fetchedData = {
                    headers: Object.fromEntries(cloned1.headers.entries()),
                    body: bodyBuffer.toString('base64'),
                    status: cloned1.status,
                    url: cloned1.url
                };
                requestStore == null ? void 0 : (_requestStore_serverComponentsHmrCache = requestStore.serverComponentsHmrCache) == null ? void 0 : _requestStore_serverComponentsHmrCache.set(cacheKey, fetchedData);
                if (isCacheableRevalidate) {
                    await incrementalCache.set(cacheKey, {
                        kind: _responsecache.CachedRouteKind.FETCH,
                        data: fetchedData,
                        revalidate: normalizedRevalidate
                    }, {
                        fetchCache: true,
                        revalidate: externalRevalidate,
                        fetchUrl,
                        fetchIdx,
                        tags
                    });
                }
            }).catch((error)=>console.warn(\`Failed to set fetch cache\`, input, error)).finally(handleUnlock));

            return cloned2;
          "
    `);
  });
});
