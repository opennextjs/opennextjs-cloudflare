---
"@opennextjs/cloudflare": patch
---

add: Ensure that the initial request.signal is passed to the wrapper

`request.signal.onabort` is now supported in route handlers. Needs this [PR](https://github.com/opennextjs/opennextjs-aws/pull/952) from `opennextjs-aws`.