---
"@opennextjs/cloudflare": patch
---

Use `OPEN_NEXT_BUILD_ID` instead of `NEXT_BUILD_ID` in the cache keys.

As of Next 16.2 `NEXT_BUILD_ID` is a fixed value when deploymentId is set explicitly.

See <https://github.com/opennextjs/opennextjs-aws/pull/1144>
