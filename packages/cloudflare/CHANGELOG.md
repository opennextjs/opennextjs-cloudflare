# @opennextjs/cloudflare

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
