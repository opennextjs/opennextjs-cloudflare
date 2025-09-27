---
"@opennextjs/cloudflare": minor
---

Support multiple Wrangler configuration files via `--config` flag

Enable passing multiple configuration files to the OpenNext.js Cloudflare CLI
using the `--config` flag, matching Wrangler's native capability. This allows
running multiple workers in a single dev session, which is essential for RPC
communication with Durable Objects during local development as documented in the
[Wrangler API bindings guide](https://developers.cloudflare.com/workers/wrangler/api/#supported-bindings)
