---
"@opennextjs/cloudflare": patch
---

Adds support for passing options to `initOpenNextCloudflareForDev()`. This allows you to configure how your Cloudflare bindings will behave during [local development](https://opennext.js.org/cloudflare/get-started#11-develop-locally).

For example, the below configuration will persist the local state of bindings to a custom directory. Which can be useful if you want to share the state between different apps that reuse the same bindings in a monorepo.

```ts
initOpenNextCloudflareForDev({
  persist: {
    path: "../../.wrangler/state/v3/custom-dir",
  },
});
```

You can find the configuration type with it's available options [here](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/api/integrations/platform/index.ts#L32) in the Wrangler source code.
