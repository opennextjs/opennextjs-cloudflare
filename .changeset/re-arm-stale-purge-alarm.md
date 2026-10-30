---
"@opennextjs/cloudflare": patch
---

fix: re-arm the bucket cache purge alarm when the stored alarm is in the past

Affects apps using `purgeCache({ type: "durableObject" })` (the `NEXT_CACHE_DO_PURGE` binding). The Durable Object only scheduled its purge alarm when `getAlarm()` returned `null`. When the alarm handler failed and exhausted its retries (for example after the `Wrong number of parameter bindings` error fixed in #1289, or a purge rate limit), the past alarm timestamp stayed in storage, so no alarm was ever scheduled again: every later `revalidateTag` / `revalidatePath` queued its tags in the Durable Object but the CDN cache was never purged and pages stayed stale. The alarm is now re-armed when it is missing or already in the past, so the next revalidation after upgrading flushes the queued tags without resetting the Durable Object. See https://github.com/opennextjs/opennextjs-cloudflare/issues/929
