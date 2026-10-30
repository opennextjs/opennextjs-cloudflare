# gh-1322

Regression example for [opennextjs/opennextjs-cloudflare#1322](https://github.com/opennextjs/opennextjs-cloudflare/issues/1322) and [#1214](https://github.com/opennextjs/opennextjs-cloudflare/issues/1214).

`pg` (used directly or through `@prisma/adapter-pg`) loads its Workers socket from `pg-cloudflare`, whose implementation is only exposed through the `workerd` export condition. Next.js keeps `pg` external and traces it with the Node.js conditions, so the Turbopack trace only contains the empty `default` entry of `pg-cloudflare`. The adapter only copied the `workerd` build of packages listed in `serverExternalPackages`, which never includes the transitive `pg-cloudflare`, so the build failed with:

```text
✘ [ERROR] Could not resolve "pg-cloudflare"
  The module "./dist/index.js" was not found on the file system
```

The webpack trace happens to include `dist/index.js`, so the example builds with Turbopack (the default for `next build` on Next.js 16) to reproduce the failure.

The `/api/pg` route constructs a `pg` `Client` (without connecting) and reports which socket class `pg` selected. On workerd it must return:

```json
{ "stream": "CloudflareSocket", "startTls": true }
```

No Hyperdrive binding or database is needed, so the e2e test is self-contained.

## Running

```sh
pnpm --filter gh-1322 preview # build the worker and serve it locally
pnpm --filter gh-1322 e2e     # run the Playwright test
```
