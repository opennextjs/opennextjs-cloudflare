---
"@opennextjs/cloudflare": patch
---

bump the number of retries for r2 cache uploads

Increase the retry count from 5 to 15 with a capped exponential backoff to improve resilience against transient R2 write failures during cache population.
