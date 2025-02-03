---
"@opennextjs/cloudflare": patch
---

fix: provide a proper error message when using `getCloudflareContext` in static routes

`getCloudflareContext` can't be used in static routes, currently a misleading error
message incorrectly tells the developer that they haven't called `initOpenNextCloudflareForDev`
in their config file, this change updates such error message to properly clarify what
the issue is (and how to solve it)
