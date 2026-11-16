# r2-incremental-cache

Example using the R2 incremental cache wrapped in the regional cache (`withRegionalCache`), with the D1 tag cache, the memory queue and `enableCacheInterception`. The OpenNext config is in `.custom-config/my-opennext-config.ts`.

The e2e tests cover:

- ISR (`e2e/base.spec.ts`).
- Regional cache keys that the URL parser could resolve to another entry (`e2e/cache-key-encoding.spec.ts`).
- A page revalidated with `revalidateTag` is not served stale from the regional cache with `bypassTagCacheOnCacheHit` ([#1295](https://github.com/opennextjs/opennextjs-cloudflare/issues/1295), `e2e/revalidate-tag.spec.ts`).

## The regional cache is cleared on start

`e2e/revalidate-tag.spec.ts` revalidates `/revalidate-tag` before the page is in the regional cache. There is no cache purge locally, so once the page is in the regional cache, revalidating it has no effect.

The regional cache uses the Cache API, which wrangler persists in `.wrangler/state/v3/cache`. Its keys contain the build id, so a new build starts with an empty regional cache, but running the tests again on the same build (e.g. with `CI=true` or `SKIP_NEXT_APP_BUILD=true`) would not. That's why `preview:worker` deletes `.wrangler/state/v3/cache` before starting the worker. The D1 and R2 state can be kept: `preview` uploads the prerendered entries to R2 again.

The test still fails when:

- it runs against a server that was already running (Playwright's `reuseExistingServer` when `CI` is not set): stop the server first,
- it is retried: the first attempt has put the page in the regional cache, so a retry fails too.

## Running

```sh
pnpm --filter r2-incremental-cache preview # build the worker and serve it locally
pnpm --filter r2-incremental-cache e2e     # build the worker and run the Playwright tests
```
