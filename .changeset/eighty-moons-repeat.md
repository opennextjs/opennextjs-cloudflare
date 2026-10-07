---
"@opennextjs/cloudflare": patch
---

fix: validate each redirect target in the image loader

`remotePatterns` is only applied to the `url` query parameter, so once an allowed host answered with a `Location` header it decided where the loader went next. Every hop is now checked for its scheme and for a literal non-routable address, and a rejected target returns 400 rather than being followed. A `Location` written as a relative reference is now resolved against the URL of the hop that sent it instead of being passed to `fetch` as-is.
