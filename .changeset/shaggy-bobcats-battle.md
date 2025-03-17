---
"@opennextjs/cloudflare": patch
---

Adds support for passing options to initOpenNextCloudflareForDev().

For example:

```ts
initOpenNextCloudflareForDev({
  persist: {
    path: "../../.wrangler/state/v3/custom-dir",
  },
});
```
