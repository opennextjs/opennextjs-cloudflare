---
"@opennextjs/cloudflare": patch
---

chore: Upgrade vitest from v2 to v4

Upgrades `vitest` from `^2.1.1` to `^4.1.4` and `@types/node` from `^22.2.0` to `^22.12.0` in the workspace catalog.

Several test files were updated to accommodate breaking changes in Vitest v4: `vi.clearAllMocks()` was added alongside `vi.restoreAllMocks()` in `afterEach` hooks since Vitest v4 changed `restoreAllMocks` to also reset spy implementations, which caused mocks to lose their configured behavior between tests. The `MockCloudflare` mock in `create-wrangler-config.spec.ts` was rewritten using a `class` declaration to properly support static properties such as `NotFoundError`. A trailing `//# sourceMappingURL` comment was removed from an inline snapshot in `use-cache.spec.ts` as it is no longer emitted by the updated toolchain. An `unknown` intermediate cast was added for the `Readable.toWeb()` return value in `populate-cache.ts` to satisfy the stricter TypeScript types shipped with the updated `@types/node`.
