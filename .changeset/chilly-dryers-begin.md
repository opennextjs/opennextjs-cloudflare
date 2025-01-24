---
"@opennextjs/cloudflare": minor
---

introduce new `initOpenNextCloudflareForDev` utility and make `getCloudflareContext` synchronous

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
