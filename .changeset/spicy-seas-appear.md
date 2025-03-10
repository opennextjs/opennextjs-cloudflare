---
"@opennextjs/cloudflare": patch
---

fix: deployed worker unable to invoke itself in memory queue

In deployments, Cloudflare Workers are unable to invoke workers on the same account via fetch, and the recommended way to call a worker is to use a service binding. This change switches to use service bindings for the memory queue to avoid issues with worker-to-worker subrequests.

To continue using the memory queue, add a service binding to your wrangler config for the binding `NEXT_CACHE_REVALIDATION_WORKER`.

```json
{
  "services": [
    {
      "binding": "NEXT_CACHE_REVALIDATION_WORKER",
      "service": "<WORKER_NAME>"
    }
  ]
}
```
