---
"@opennextjs/cloudflare": patch
---

fix: use the custom wrangler config path during static generation

When a custom `configPath` was passed to `initOpenNextCloudflareForDev` (or `--config` to `opennextjs-cloudflare build`), `next build` could fail while prerendering static pages because the SSG worker processes fell back to the default wrangler config and could not find the bindings. The config path and environment are now forwarded to those workers through the environment (`NEXT_DEV_WRANGLER_CONFIG_PATH` and `NEXT_DEV_WRANGLER_ENV`).
