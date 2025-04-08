# @opennextjs/cloudflare

## 1.0.0-beta.2

### Changes

- [#546](https://github.com/opennextjs/opennextjs-cloudflare/pull/546) [`9adc3a3`](https://github.com/opennextjs/opennextjs-cloudflare/commit/9adc3a3b6ca7d75d868523024491800fe25f3e06) Thanks [@james-elicx](https://github.com/james-elicx)! - feat: populate kv incremental cache

- [#547](https://github.com/opennextjs/opennextjs-cloudflare/pull/547) [`25ade6f`](https://github.com/opennextjs/opennextjs-cloudflare/commit/25ade6f7edf6a48336058c2c5e2fdf7ec0d9b7c6) Thanks [@james-elicx](https://github.com/james-elicx)! - feat: static assets incremental cache

## 1.0.0-beta.1

### Changes

- [#541](https://github.com/opennextjs/opennextjs-cloudflare/pull/541) [`ca7df8e`](https://github.com/opennextjs/opennextjs-cloudflare/commit/ca7df8eb30f4c0414c700bd905ebfed6346e64b1) Thanks [@vicb](https://github.com/vicb)! - bump `@opennextjs/aws` to 3.5.5

- [#536](https://github.com/opennextjs/opennextjs-cloudflare/pull/536) [`8abea36`](https://github.com/opennextjs/opennextjs-cloudflare/commit/8abea3634adc1079338c9759b9df57bc06604323) Thanks [@vicb](https://github.com/vicb)! - Fix R2 bucket population

- [#540](https://github.com/opennextjs/opennextjs-cloudflare/pull/540) [`f46fcae`](https://github.com/opennextjs/opennextjs-cloudflare/commit/f46fcaeab4382c4efb5f070e72f7c537bbd54a12) Thanks [@vicb](https://github.com/vicb)! - test: sync e2e with aws

## 1.0.0-beta.0

### Minor Changes

- [#526](https://github.com/opennextjs/opennextjs-cloudflare/pull/526) [`8b40268`](https://github.com/opennextjs/opennextjs-cloudflare/commit/8b40268a328f43ee7dfc8fc68bcf14badc0650ca) Thanks [@vicb](https://github.com/vicb)! - Prepare for release 1.0.0-beta.0

  Bump `@opennextjs/aws` to 3.5.4

  BREAKING CHANGES

  - `DurableObjectQueueHandler` renamed to `DOQueueHandler`
  - `NEXT_CACHE_DO_QUEUE_MAX_NUM_REVALIDATIONS` renamed to `NEXT_CACHE_DO_QUEUE_MAX_RETRIES`
  - `D1TagCache` has been removed, use `D1NextModeTagCache` instead.
  - The `enableShardReplication` and `shardReplicationOptions` options passed to `ShardedDOTagCache`
    have been folded into `shardReplication`. A value for `shardReplication` must be specified to enable
    replications. The value must be an object with the number of soft and hard replicas.

## 0.6.6

### Patch Changes

- [#520](https://github.com/opennextjs/opennextjs-cloudflare/pull/520) [`3bd200a`](https://github.com/opennextjs/opennextjs-cloudflare/commit/3bd200a3ef9a85856a7004395aa7b27b6069b8ee) Thanks [@vicb](https://github.com/vicb)! - Define `process.version` and `process.versions.node`

- [#522](https://github.com/opennextjs/opennextjs-cloudflare/pull/522) [`79fadc4`](https://github.com/opennextjs/opennextjs-cloudflare/commit/79fadc49d303052165c70800b785fd488fad4c41) Thanks [@vicb](https://github.com/vicb)! - Log exceptions in `requirePage` and `NodeModuleLoader` when `OPEN_NEXT_DEBUG=1`

- [#523](https://github.com/opennextjs/opennextjs-cloudflare/pull/523) [`19dedc7`](https://github.com/opennextjs/opennextjs-cloudflare/commit/19dedc75bfa805802cee0f0e727e6c5355c5c747) Thanks [@vicb](https://github.com/vicb)! - fix: process.env has a higher loading priority than .env files

- [#469](https://github.com/opennextjs/opennextjs-cloudflare/pull/469) [`aef8e51`](https://github.com/opennextjs/opennextjs-cloudflare/commit/aef8e517eba94fe5ece23427c410c0cad15b5917) Thanks [@Juuldamen](https://github.com/Juuldamen)! - Adds support for passing options to `initOpenNextCloudflareForDev()`. This allows you to configure how your Cloudflare bindings will behave during [local development](https://opennext.js.org/cloudflare/get-started#11-develop-locally).

  For example, the below configuration will persist the local state of bindings to a custom directory. Which can be useful if you want to share the state between different apps that reuse the same bindings in a monorepo.

  ```ts
  initOpenNextCloudflareForDev({
    persist: {
      path: "../../.wrangler/state/v3/custom-dir",
    },
  });
  ```

  You can find the configuration type with it's available options [here](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/api/integrations/platform/index.ts#L32) in the Wrangler source code.

## 0.6.5

### Patch Changes

- [#514](https://github.com/opennextjs/opennextjs-cloudflare/pull/514) [`3165593`](https://github.com/opennextjs/opennextjs-cloudflare/commit/3165593eb9b47bf07aff2fc1561c6481e6b8715a) Thanks [@vicb](https://github.com/vicb)! - fix(middleware): enable wasm in bundled middleware

- [#515](https://github.com/opennextjs/opennextjs-cloudflare/pull/515) [`cef5e03`](https://github.com/opennextjs/opennextjs-cloudflare/commit/cef5e03177a1b8e31436394669efa35d3978bef5) Thanks [@vicb](https://github.com/vicb)! - perf: optimize SQL queries

## 0.6.4

### Patch Changes

- [#512](https://github.com/opennextjs/opennextjs-cloudflare/pull/512) [`96efdc1`](https://github.com/opennextjs/opennextjs-cloudflare/commit/96efdc1191cbee3582d84af7293ee0aa83e36f09) Thanks [@james-elicx](https://github.com/james-elicx)! - fix: yarn v4 not passing args to wrangler correctly

## 0.6.3

### Patch Changes

- [#509](https://github.com/opennextjs/opennextjs-cloudflare/pull/509) [`42e2b5c`](https://github.com/opennextjs/opennextjs-cloudflare/commit/42e2b5c2eb4dda7ce9e46a2c6acb99799ce4228f) Thanks [@ItsWendell](https://github.com/ItsWendell)! - fix: nextjs handler not detected in worker

## 0.6.2

### Patch Changes

- [#505](https://github.com/opennextjs/opennextjs-cloudflare/pull/505) [`ce7516d`](https://github.com/opennextjs/opennextjs-cloudflare/commit/ce7516db9067f3f04f94bf2e59725b38efd6cf66) Thanks [@james-elicx](https://github.com/james-elicx)! - fix: npm failing to pass args to wrangler

## 0.6.1

### Patch Changes

- [#503](https://github.com/opennextjs/opennextjs-cloudflare/pull/503) [`ba35663`](https://github.com/opennextjs/opennextjs-cloudflare/commit/ba35663c36e22de76926b3edfba77a89d86c798e) Thanks [@james-elicx](https://github.com/james-elicx)! - fix: bun failing to spawn wrangler

## 0.6.0

### Minor Changes

- [#499](https://github.com/opennextjs/opennextjs-cloudflare/pull/499) [`5037f57`](https://github.com/opennextjs/opennextjs-cloudflare/commit/5037f57208304055cc844e99708bbe7fc3c08c96) Thanks [@vicb](https://github.com/vicb)! - Refactor the codebase for consistency

  BREAKING CHANGE

  Overrides:

  Overrides now live in `@opennextjs/cloudflare/overrides` and some files have been renamed.

  - Incremental cache overrides: `@opennextjs/cloudflare/overrides/incremental-cache/...`
  - Tag cache overrides: `@opennextjs/cloudflare/overrides/tag-cache/...`
  - Queue overrides: `@opennextjs/cloudflare/overrides/queue/...`

  For example the KV incremental cache override can be imported as `@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache`.

  Environment variables and bindings name changes:

  - `NEXT_CACHE_WORKERS_KV` -> `NEXT_INC_CACHE_KV`
  - `NEXT_CACHE_R2_...` -> `NEXT_INC_CACHE_R2_...`
  - `NEXT_CACHE_D1` -> `NEXT_TAG_CACHE_D1`
  - `NEXT_CACHE_DO_...` -> `NEXT_TAG_CACHE_DO_...`
  - `NEXT_CACHE_DO_REVALIDATION` -> `NEXT_CACHE_DO_QUEUE`
  - `NEXT_CACHE_REVALIDATION_WORKER` -> `WORKER_SELF_REFERENCE`

  Other:

  `NEXT_CACHE_D1_TAGS_TABLE` and `NEXT_CACHE_D1_REVALIDATIONS_TABLE` have been dropped.
  The tables have a fixed names `tags` and `revalidations`.

- [#479](https://github.com/opennextjs/opennextjs-cloudflare/pull/479) [`0c93e8b`](https://github.com/opennextjs/opennextjs-cloudflare/commit/0c93e8b3e22960553c6537b6e83b84cbd8724423) Thanks [@james-elicx](https://github.com/james-elicx)! - feat: commands for cli actions

  The OpenNext Cloudflare CLI now uses the following commands;

  - `build`: build the application
  - `populateCache`: populate either the local or remote cache
  - `preview`: populate the local cache and start a dev server
  - `deploy`: populate the remote cache and deploy to production

- [#490](https://github.com/opennextjs/opennextjs-cloudflare/pull/490) [`00f6071`](https://github.com/opennextjs/opennextjs-cloudflare/commit/00f60716227a883d9c3138e3797aaba9bd8fed33) Thanks [@vicb](https://github.com/vicb)! - Drop the deprecated kvCache in favor of kv-cache

### Patch Changes

- [#487](https://github.com/opennextjs/opennextjs-cloudflare/pull/487) [`0702d2e`](https://github.com/opennextjs/opennextjs-cloudflare/commit/0702d2ea8b6480d358f750060e510b466bdf8fd5) Thanks [@james-elicx](https://github.com/james-elicx)! - feat: support passing the wrangler environment when populating the cache

- [#480](https://github.com/opennextjs/opennextjs-cloudflare/pull/480) [`e0ec01d`](https://github.com/opennextjs/opennextjs-cloudflare/commit/e0ec01d50d3ae9f15294735f8fd28d84d29140ca) Thanks [@conico974](https://github.com/conico974)! - fix deduplication for memory queue and add some log

- [#481](https://github.com/opennextjs/opennextjs-cloudflare/pull/481) [`9b0db4d`](https://github.com/opennextjs/opennextjs-cloudflare/commit/9b0db4dcc4e84cac8f17043dbcd79b2ed7b91983) Thanks [@conico974](https://github.com/conico974)! - fix `res.revalidate` not working in page router api route

- [#484](https://github.com/opennextjs/opennextjs-cloudflare/pull/484) [`6ce5643`](https://github.com/opennextjs/opennextjs-cloudflare/commit/6ce5643c1c37c98b36b2b594616907f8d35ee405) Thanks [@conico974](https://github.com/conico974)! - Add sharding replication for the Durable Object Tag Cache

- [#470](https://github.com/opennextjs/opennextjs-cloudflare/pull/470) [`2650043`](https://github.com/opennextjs/opennextjs-cloudflare/commit/26500437cd9e6cabf44f6308a124ca0687754bf8) Thanks [@conico974](https://github.com/conico974)! - feat: add a sharded SQLite Durable object implementation for the tag cache

- [#485](https://github.com/opennextjs/opennextjs-cloudflare/pull/485) [`ced7d46`](https://github.com/opennextjs/opennextjs-cloudflare/commit/ced7d4639209fd45f34c5109de89a0671b5d1874) Thanks [@conico974](https://github.com/conico974)! - add an option for disabling sqlite on the durable object queue

- [#460](https://github.com/opennextjs/opennextjs-cloudflare/pull/460) [`60171f5`](https://github.com/opennextjs/opennextjs-cloudflare/commit/60171f58a2817acb2ecef4ea67a3a60ab522bc0d) Thanks [@conico974](https://github.com/conico974)! - feat: durable object de-duping revalidation queue

- [#497](https://github.com/opennextjs/opennextjs-cloudflare/pull/497) [`958f322`](https://github.com/opennextjs/opennextjs-cloudflare/commit/958f3223781753810baca287e49533ae12364d5e) Thanks [@vicb](https://github.com/vicb)! - Switch to bundled middleware

- [#436](https://github.com/opennextjs/opennextjs-cloudflare/pull/436) [`86c0139`](https://github.com/opennextjs/opennextjs-cloudflare/commit/86c0139535350f5806c27a665f6ec8fcfb96e398) Thanks [@james-elicx](https://github.com/james-elicx)! - feat: auto-populating d1 cache data

- [#464](https://github.com/opennextjs/opennextjs-cloudflare/pull/464) [`acfc7f3`](https://github.com/opennextjs/opennextjs-cloudflare/commit/acfc7f35a387b84607674e93d8ef66db4e634669) Thanks [@conico974](https://github.com/conico974)! - Implement next mode for d1 tag cache that will reduce write

- [#486](https://github.com/opennextjs/opennextjs-cloudflare/pull/486) [`25a8f4c`](https://github.com/opennextjs/opennextjs-cloudflare/commit/25a8f4c82c71cbf0c3dedd79d9a4f52e012bc95e) Thanks [@conico974](https://github.com/conico974)! - auto create table for D1NextModeTagCache

- [#443](https://github.com/opennextjs/opennextjs-cloudflare/pull/443) [`54508ff`](https://github.com/opennextjs/opennextjs-cloudflare/commit/54508ffc613cc12d27e014c472632a59db7d7833) Thanks [@james-elicx](https://github.com/james-elicx)! - feat: r2 adapter for the incremental cache

- [#491](https://github.com/opennextjs/opennextjs-cloudflare/pull/491) [`e9dc621`](https://github.com/opennextjs/opennextjs-cloudflare/commit/e9dc621bec7f7d532ee2855e4ef2b7155662c910) Thanks [@vicb](https://github.com/vicb)! - Serve `/cdn-cgi/image/...` images in dev

## 0.5.12

### Patch Changes

- [#467](https://github.com/opennextjs/opennextjs-cloudflare/pull/467) [`09c5116`](https://github.com/opennextjs/opennextjs-cloudflare/commit/09c51167d4e6327bd48081bc18a9adb70a70dd04) Thanks [@vicb](https://github.com/vicb)! - Update wrangler dependency

## 0.5.11

### Patch Changes

- [#455](https://github.com/opennextjs/opennextjs-cloudflare/pull/455) [`1d40ab1`](https://github.com/opennextjs/opennextjs-cloudflare/commit/1d40ab12e7c581d69a773d56885f10fa33f3b2b8) Thanks [@vicb](https://github.com/vicb)! - sync with `@opennextjs/aws@3.5.2`

- [#453](https://github.com/opennextjs/opennextjs-cloudflare/pull/453) [`95caa87`](https://github.com/opennextjs/opennextjs-cloudflare/commit/95caa87cd9f1880972f1657e2a7ab79daf86dc0a) Thanks [@vicb](https://github.com/vicb)! - fix: Pages router API routes with Next 14

- [#452](https://github.com/opennextjs/opennextjs-cloudflare/pull/452) [`161a5f7`](https://github.com/opennextjs/opennextjs-cloudflare/commit/161a5f7f53af0435576f44dc5c15df230c6a3090) Thanks [@vicb](https://github.com/vicb)! - fix: patch the webpack runtime when there is a single chunk

## 0.5.10

### Patch Changes

- [#445](https://github.com/opennextjs/opennextjs-cloudflare/pull/445) [`6a389fe`](https://github.com/opennextjs/opennextjs-cloudflare/commit/6a389fe54b360e542e4db0266e29f0e818176651) Thanks [@james-elicx](https://github.com/james-elicx)! - fix: deployed worker unable to invoke itself in memory queue

  In deployments, Cloudflare Workers are unable to invoke workers on the same account via fetch, and the recommended way to call a worker is to use a service binding. This change switches to use service bindings for the memory queue to avoid issues with worker-to-worker subrequests.

  To continue using the memory queue, add a service binding to your wrangler config for the binding `NEXT_CACHE_REVALIDATION_WORKER`.

  ```json
  {
    "services": [
      {
        "binding": "NEXT_CACHE_REVALIDATION_WORKER",
        "service": "<WORKER_NAME>"
      }
    ]
  }
  ```

## 0.5.9

### Patch Changes

- [#441](https://github.com/opennextjs/opennextjs-cloudflare/pull/441) [`4966779`](https://github.com/opennextjs/opennextjs-cloudflare/commit/4966779cabb9607eb59eae49e87d555323fdfaf1) Thanks [@conico974](https://github.com/conico974)! - Fix for `Invariant: renderHTML should not be called in minimal mode`

## 0.5.8

### Patch Changes

- [#431](https://github.com/opennextjs/opennextjs-cloudflare/pull/431) [`9ad6714`](https://github.com/opennextjs/opennextjs-cloudflare/commit/9ad67145ee718c67b94bbfcbc144a565b3fd0dae) Thanks [@HyperKiko](https://github.com/HyperKiko)! - fix pages api routes

  fixed pages api routes by inlining a dynamic require in the `NodeModuleLoader` class

## 0.5.7

### Patch Changes

- [#429](https://github.com/opennextjs/opennextjs-cloudflare/pull/429) [`1c80772`](https://github.com/opennextjs/opennextjs-cloudflare/commit/1c807722f848b1eee59ef6f8a107f8525d602ea9) Thanks [@vicb](https://github.com/vicb)! - fix import paths in templates

## 0.5.6

### Patch Changes

- [#412](https://github.com/opennextjs/opennextjs-cloudflare/pull/412) [`58b200f`](https://github.com/opennextjs/opennextjs-cloudflare/commit/58b200fc1d4f2a4906c13f8268fc7612457861a7) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `defineCloudflareConfig` utility

  this change adds a new `defineCloudflareConfig` utility that developers can use in their `open-next.config.ts`
  file to easily generate a configuration compatible with the adapter

  Example usage:

  ```ts
  // open-next.config.ts
  import { defineCloudflareConfig } from "@opennextjs/cloudflare";
  import kvIncrementalCache from "@opennextjs/cloudflare/kv-cache";

  export default defineCloudflareConfig({
    incrementalCache: kvIncrementalCache,
  });
  ```

## 0.5.5

### Patch Changes

- [#417](https://github.com/opennextjs/opennextjs-cloudflare/pull/417) [`6d3291f`](https://github.com/opennextjs/opennextjs-cloudflare/commit/6d3291fdbdd9f0da4fcdabf4131b82288358b35f) Thanks [@vicb](https://github.com/vicb)! - define \_\_filename globally

- [#413](https://github.com/opennextjs/opennextjs-cloudflare/pull/413) [`01e2bfb`](https://github.com/opennextjs/opennextjs-cloudflare/commit/01e2bfb81f8decccce46f7d4e8427a39113814b5) Thanks [@ha1fstack](https://github.com/ha1fstack)! - improve windows support

## 0.5.4

### Patch Changes

- [#320](https://github.com/opennextjs/opennextjs-cloudflare/pull/320) [`ff2dd55`](https://github.com/opennextjs/opennextjs-cloudflare/commit/ff2dd55aa5645f9c54b064ced02719ff83321a04) Thanks [@james-elicx](https://github.com/james-elicx)! - feat: d1 adapter for the tag cache

- [#409](https://github.com/opennextjs/opennextjs-cloudflare/pull/409) [`a604c85`](https://github.com/opennextjs/opennextjs-cloudflare/commit/a604c8512c90921e90293c1e96a71926930234db) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - make sure that instrumentation files work

  currently [instrumentation files](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
  in applications built using the adapter are ignored, the changes here
  make sure that those are instead properly included in the applications

- [#410](https://github.com/opennextjs/opennextjs-cloudflare/pull/410) [`d30424b`](https://github.com/opennextjs/opennextjs-cloudflare/commit/d30424baff219792a52e3b6c766398189be5f19e) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - remove `eval` calls introduced by `depd` wrapped functions

  Some dependencies of Next.js (`raw-body` and `send`) use `depd` to deprecate some of their functions,
  `depd` uses `eval` to generate a deprecated version of such functions, this causes `eval` warnings in
  the terminal even if these functions are never called, the changes here by patching the depd `wrapfunction`
  function so that it still retains the same type of behavior but without using `eval`

- [#404](https://github.com/opennextjs/opennextjs-cloudflare/pull/404) [`12d385d`](https://github.com/opennextjs/opennextjs-cloudflare/commit/12d385d84ff0ab7e3475cd9fea01d03b6876c46d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix incorrect (sync) `getCloudflareContext` error message

  currently `getCloudflareContext` run in sync mode at the top level of a not static route
  gives a misleading error message saying that the function needs to be run in a not static
  route, the changes here correct this error message clarifying that the problem actually is

## 0.5.3

### Patch Changes

- [#394](https://github.com/opennextjs/opennextjs-cloudflare/pull/394) [`1479263`](https://github.com/opennextjs/opennextjs-cloudflare/commit/147926323ea98ab44151feb7db36b47722dcc8cc) Thanks [@vicb](https://github.com/vicb)! - fix: improve windows support

## 0.5.2

### Patch Changes

- [#372](https://github.com/opennextjs/opennextjs-cloudflare/pull/372) [`522076b`](https://github.com/opennextjs/opennextjs-cloudflare/commit/522076b2972c4e7038f38dc20c2c7a25855d479e) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add "async mode" to `getCloudflareContext`

  Add an `async` option to `getCloudflareContext({async})` to run it in "async mode", the difference being that the returned value is a
  promise of the Cloudflare context instead of the context itself

  The main of this is that it allows the function to also run during SSG (since the missing context can be created on demand).

## 0.5.1

### Patch Changes

- ad895ed: fix: vercel og patch not moving to right node_modules directory

  There are two separate places where the node_modules could be. One is a package-scoped node_modules which does not always exist - if it doesn't exist, the server functions-scoped node_modules is used.

## 0.5.0

### Minor Changes

- 82bb588: feat: basic in-memory de-duping revalidation queue

### Patch Changes

- 2e48d4f: fix: make sure that fetch cache `set`s are properly awaited

  Next.js does not await promises that update the incremental cache for fetch requests,
  that is needed in our runtime otherwise the cache updates get lost, so this change
  makes sure that the promise is properly awaited via `waitUntil`

- 0c26049: fix path to file template in `open-next.config.ts`.

## 0.4.8

### Patch Changes

- ac8b271: fix waitUntil

  Calling `waitUntil`/`after` was failing when mulitple requests were handled concurrently.
  This is fixed by pulling opennextjs/opennextjs-aws#733

- 761a312: import `randomUUID` from `node:crypto` to support NodeJS 18

## 0.4.7

### Patch Changes

- 420b598: Fix asset cache path
- a19b34d: perf: reduce CPU and memory usage by limiting code to AST parsing
- f30a5fe: bump `@opennextjs/aws` dependency to `https://pkg.pr.new/@opennextjs/aws@727`
- 6791cea: Use kebab-case for the KV Cache.
- a630aea: fix: enable using the `direct` queue for isr

  The `direct` mode is not recommended for use in production as it does not de-dupe requests.

- f30a5fe: Fix: make sure that the kvCache doesn't serve stale cache values from assets when there is no KV binding

## 0.4.6

### Patch Changes

- 9561277: fix: remove dynamic require for map file

  ESBuild tries to load all files in the chunks folder with `require("./chunks/" + var)`.
  This is an error when the folder contains map file.

## 0.4.5

### Patch Changes

- 1ccff65: bump `@opennextjs/aws` dependency to `https://pkg.pr.new/@opennextjs/aws@724`

  this bump fixes rewrites to external urls not working when the external urls
  point to resources hosted on the Cloudflare network

- 30374b9: fix: Drop the module condition from ESBuild

  Because Next (via nft) does not use the module condition, ESBuild should not use it.
  Otherwise we might end up with missing files and a broken build.

## 0.4.4

### Patch Changes

- 6103547: fix: provide a proper error message when using `getCloudflareContext` in static routes

  `getCloudflareContext` can't be used in static routes, currently a misleading error
  message incorrectly tells the developer that they haven't called `initOpenNextCloudflareForDev`
  in their config file, this change updates such error message to properly clarify what
  the issue is (and how to solve it)

- 0a6191d: fix the encoding of \_\_NEXT_PRIVATE_STANDALONE_CONFIG
- da7f8d8: fix: enable PPR with `wrangler dev`
- 714172d: fix: trailing slash redirect
- 0892679: fix: inline optional dependencies when bundling the server

## 0.4.3

### Patch Changes

- 9d45ee8: fix the error message of getCloudflareContext

  Hardcode function names that would get mangled otherwise.

- ac52954: bump the `wrangler` peer dependency (so to avoid multiple `Using vars defined in .dev.vars` logs during local development)

## 0.4.2

### Patch Changes

- 1b3a972: Dump ESBuild metadata to `handler.mjs.meta.json`

  The ESBuild metadata are written to a file alongside `handler.mjs`
  in `.open-next/server-functions/default/...`

- 5c90521: refactor: Make the list of optional dependencies configurable
- 67acb2f: fix build issues with `@opentelemetry`

  By using the pre-compiled library provided by Next.

- 3ed6cd1: fix: syntax error

## 0.4.1

### Patch Changes

- 1a2b815: fix: make sure that the `initOpenNextCloudflareForDev()` logic runs only once

  Currently calling `initOpenNextCloudflareForDev()` in the Next.js config file causes
  this initialization logic to run twice, consuming more resources and causing extra
  noise in the terminal logs, this change makes sure that the initialization logic
  is run only once instead

## 0.4.0

### Minor Changes

- 8de2c04: introduce new `initOpenNextCloudflareForDev` utility and make `getCloudflareContext` synchronous

  this change introduces a new `initOpenNextCloudflareForDev` function that must called in the [Next.js config file](https://nextjs.org/docs/app/api-reference/config/next-config-js) to integrate the Next.js dev server with the open-next Cloudflare adapter.

  Also makes `getCloudflareContext` synchronous.

  Additionally the `getCloudflareContext` can now work during local development (`next dev`) in the edge runtime (including middlewares).

  Moving forward we'll recommend that all applications include the use of the `initOpenNextCloudflareForDev` utility in their config file (there is no downside in doing so and it only effect local development).

  Example:

  ```js
  // next.config.mjs

  import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

  initOpenNextCloudflareForDev();

  /** @type {import('next').NextConfig} */
  const nextConfig = {};

  export default nextConfig;
  ```

### Patch Changes

- 4ec334a: fix: @vercel/og failing due to using the node version.

  Patches usage of the @vercel/og library to require the edge runtime version, and enables importing of the fallback font.

## 0.3.10

### Patch Changes

- 48f863f: fix: do not require `caniuse-lite`

  `caniuse-lite` is an optional dependency.

- 27ab1ab: refactor: use the new regex utility for constructing cross-platform paths

## 0.3.9

### Patch Changes

- 67fafeb: fix top level awaits not working in middlewares by bumping the `@opennextjs/aws` package

## 0.3.8

### Patch Changes

- 05ee8d4: fix: invalid paths in windows bundles.

## 0.3.7

### Patch Changes

- 41c55a8: Add support for specifying wrangler environment when using next dev so that bindings and vars are properly loaded. This can be specified with the env variable NEXT_DEV_WRANGLER_ENV.
- 2e13de2: fix broken `patchRequireReactDomServerEdge` patch

## 0.3.6

### Patch Changes

- 9ab86d4: fix: host not included in route handler urls

  Next.js was unable to re-construct the correct URLs for the request in a route handler due to being unable to retrieve the hostname. This was due to the internal Next.js option `trustHostHeader` being disabled in OpenNext when there is external middleware - this option is needed for the Next.js server in our environment.

## 0.3.5

### Patch Changes

- 77e31d5: update the `patchExceptionBubbling` patch
- dbcc4be: patch `require("react-dom/server.edge")` calls in `pages.runtime.prod.js` so that they are `try-catch`ed
- 632a7d7: show error on Next.js versions older than v14

## 0.3.4

### Patch Changes

- d488d86: fix: exclude `.env.local` files for `test` mode

  Aligns with the Next.js behavior of not extracting variables from the `.env.local` file in test environments.

- 0ee77b2: fix the city header encoding

  By pulling <https://github.com/opennextjs/opennextjs-aws/pull/688>

- 4b6a50b: check and create a `wrangler.json` file for the user in case a `wrangler.(toml|json|jsonc)` file is not already present

  also introduce a new `--skipWranglerConfigCheck` cli flag and a `SKIP_WRANGLER_CONFIG_CHECK`
  environment variable that allows users to opt out of the above check (since developers might
  want to use custom locations for their config files)

- 7654867: bump `"@opennextjs/aws` dependency to `https://pkg.pr.new/@opennextjs/aws@686`

## 0.3.3

### Patch Changes

- b3949ce: fix: delete init.cache rather than assign undefined

  Assigning undefined to init.cache throws when using NextAuth

- 12a1f75: update location of output path in success message

## 0.3.2

### Patch Changes

- c0c1d04: fix: CustomRequest instantiation

  In some cases some request properties would not be initialized (i.e. method, headers, ...)
  The bug was caused by the processing the init in the CustomRequest class.
  The bug was tigerred when using clerk.

## 0.3.1

### Patch Changes

- f60a326: fix: cleanup dependencies

## 0.3.0

### Minor Changes

- ca2d452: feat: rename the binary from "cloudflare" to "opennextjs-cloudflare"

  **BREAKING CHANGE**:
  After this change the old way of running the tool (e.g. `pnpm cloudflare`) no longer works.
  Going forward use the new binary name (e.g. `pnpm opennextjs-cloudflare`).

  See [#161](https://github.com/opennextjs/opennextjs-cloudflare/issues/161)

- Add support for middleware, loading `.env*` files, ...

## 0.2.1

### Patch Changes

- 5bceecc: example: Add vercel blog starter

  Update the examples with vercel blog starter and adapt it to run on cf workers

## 0.2.0

### Minor Changes

- 6acf0fd: feat: cli arg to disable minification

  The cache handler currently forces minification. There is now a CLI arg to disable minification for the build. At the moment, this only applies to the cache handler but may be used for other parts of the build in the future when minification is introduced to them. By default, minification is enabled, but can be disabled by passing `--noMinify`.

## 0.1.1

### Patch Changes

- 66ba0ff: enhancement: Expand missing next.config error message

  Found out that next dev can run the a Next.js app without next.config but
  if we are using the adapter we throw an error if we don't find the config.
  So expanded the error for users.

## 0.1.0

### Minor Changes

- 87f4fb5: feat: configure kv binding name with env var

  The Workers KV binding used in the Next.js cache handler can be given a custom name with the `__OPENNEXT_KV_BINDING_NAME` environment variable at build-time, instead of defaulting to `NEXT_CACHE_WORKERS_KV`.

### Patch Changes

- 83abcfe: refactor: retrieve cache handler kv instance inside constructor

  The cache handler was retrieving it's KV instance as a static property on the class that was defined at some point during the execution of the Next.js server. This moves the retrieval of the KV instance to happen inside the constructor for the class, so that it is retrieved during instantiation instead.

## 0.0.3

### Patch Changes

- a99cd1e: ci: actually publish updates packages to npm

## 0.0.2

### Patch Changes

- ce8a281: ci: first deployment via changesets
