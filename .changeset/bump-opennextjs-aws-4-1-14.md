---
"@opennextjs/cloudflare": patch
---

chore: bump `@opennextjs/aws` to 4.1.14

See details at <https://github.com/opennextjs/opennextjs-aws/releases/tag/v4.1.14>

- Fix the build-time fetch cache being ignored when `deploymentId` is set.
- Fix `res.revalidate()` in Pages Router API routes on Next 15.4+, pages are now revalidated in-process.
- Fix pages rendered on demand being reported as stale one second after they were written.
- Fix entries marked stale by `revalidateTag(tag, "max")` not being served with stale-while-revalidate on Next 16.4+.
