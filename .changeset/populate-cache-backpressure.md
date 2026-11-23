---
"@opennextjs/cloudflare": patch
---

fix: pause remote cache population uploads while failed requests back off

During `opennextjs-cloudflare deploy`, populating the remote R2 incremental cache (`NEXT_INC_CACHE_R2_BUCKET`) could fail with `Failed to write "<key>" to R2 after 15 attempts` when concurrent uploads exhausted the client's connections — requests stalled without ever sending a body. All uploads now share a cooldown: a retryable failure pauses new requests until the failing entry's own backoff elapses, so the aggregate send rate slows and lets connections stabilise instead of piling new uploads onto timing-out ones.
