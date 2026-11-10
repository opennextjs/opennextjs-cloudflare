---
"@opennextjs/cloudflare": patch
---

fix: re-arm the bucket cache purge alarm when the stored alarm is in the past

Affects apps using `purgeCache({ type: "durableObject" })` (the `NEXT_CACHE_DO_PURGE` binding).

Once the purge alarm had exhausted its retries (for example after the `Wrong number of parameter bindings` error fixed in #1289, or a purge rate limit), the Durable Object never scheduled another alarm. Every later `revalidateTag` / `revalidatePath` queued its tags but the CDN cache was never purged and pages stayed stale.

The alarm is now re-armed when it is in the past. After upgrading, the next revalidation purges the queued tags without having to reset the Durable Object. See https://github.com/opennextjs/opennextjs-cloudflare/issues/929
