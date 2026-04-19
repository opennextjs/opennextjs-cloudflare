---
"@opennextjs/cloudflare": patch
---

fix: regression where getEnvFromPlatformProxy received wrong options type

This fixes a regression introduced in [32ba91a](https://github.com/opennextjs/opennextjs-cloudflare/commit/32ba91a6d3fa6b9a8b2cd5a8c973c3b3eb1108f0) where `getEnvFromPlatformProxy` call sites passed `OpenNextConfig` even though the function expects Wrangler `GetPlatformProxyOptions`.

The fix restores the pre-[32ba91a](https://github.com/opennextjs/opennextjs-cloudflare/commit/32ba91a6d3fa6b9a8b2cd5a8c973c3b3eb1108f0) argument shape by passing `{ configPath, environment }` from CLI arguments, so env resolution follows the selected Wrangler config/environment.
