# r2-incremental-cache

Example using the R2 incremental cache wrapped in the regional cache (`withRegionalCache`), with the D1 tag cache, the memory queue and `enableCacheInterception`. The OpenNext config is in `.custom-config/my-opennext-config.ts`.

## The regional cache is cleared on start

`e2e/revalidate-tag.spec.ts` needs an empty regional cache: there is no cache purge locally. `preview:worker` deletes `.wrangler/state/v3/cache` (the Cache API state persisted by wrangler) before starting the worker.

The test still fails when it runs against a server that was already running (Playwright's `reuseExistingServer` when `CI` is not set), or when it is retried.
