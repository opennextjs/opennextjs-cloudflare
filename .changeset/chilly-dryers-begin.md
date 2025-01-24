---
"@opennextjs/cloudflare": patch
---

introduce new `initOpenNextCloudflareForDev` utility and make `getCloudflareContext` synchronous

introduce a new `initOpenNextCloudflareForDev` function that when called in the [Next.js config file](https://nextjs.org/docs/app/api-reference/config/next-config-js) integrates the Next.js dev server with the open-next Cloudflare adapter. Most noticeably this enables `getCloudflareContext` to work in
the edge runtime (including middlewares) during development.

Moving forward we'll recommend that all applications include the use of this utility in their config file (there is no downside in doing so and it only effect local development).

Example:

```js
// next.config.mjs

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

thanks to this new utility we are also able to make `getCloudflareContext` synchronous, so `await`ing such function is no longer necessary
