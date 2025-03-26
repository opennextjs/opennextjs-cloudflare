---
"@opennextjs/cloudflare": minor
---

Refactor the codebase for consistency

BREAKING CHANGE

Overrides:

Overrides now live in `@opennextjs/cloudflare/overrides` and some files have been renamed.

- Incremental cache overrides: `@opennextjs/cloudflare/overrides/incremental-cache/...`
- Tag cache overrides: `@opennextjs/cloudflare/overrides/tag-cache/...`
- Queue overrides: `@opennextjs/cloudflare/overrides/queue/...`

For example the KV incremental cache override can be imported as `@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache`.

Environment variables and bindings name changes:

- `NEXT_CACHE_WORKERS_KV` -> `NEXT_INC_CACHE_KV`
- `NEXT_CACHE_R2_...` -> `NEXT_INC_CACHE_R2_...`
- `NEXT_CACHE_D1` -> `NEXT_TAG_CACHE_D1`
- `NEXT_CACHE_DO_...` -> `NEXT_TAG_CACHE_DO_...`
- `NEXT_CACHE_DO_REVALIDATION` -> `NEXT_CACHE_DO_QUEUE`
- `NEXT_CACHE_REVALIDATION_WORKER` -> `WORKER_SELF_REFERENCE`

Other:

`NEXT_CACHE_D1_TAGS_TABLE` and `NEXT_CACHE_D1_REVALIDATIONS_TABLE` have been dropped.
The tables have a fixed names `tags` and `revalidations`.
