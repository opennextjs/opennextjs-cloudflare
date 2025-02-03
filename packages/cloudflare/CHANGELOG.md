# @opennextjs/cloudflare

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
