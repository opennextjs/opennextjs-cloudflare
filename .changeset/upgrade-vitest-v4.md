---
"@opennextjs/cloudflare": patch
---

chore: Upgrade vitest from v2 to v4

Upgrades `vitest` from `^2.1.1` to `^4.1.4` and `@types/node` from `^22.2.0` to `^22.12.0` in the workspace catalog.

`clearMocks` and `restoreMocks` are now enabled globally in `vitest.config.ts`, removing the need for per-test `vi.clearAllMocks()` and `vi.restoreAllMocks()` calls across test files. Test discovery is now limited to `src` via `test.dir`, matching the current package layout and avoiding incidental matches outside the source tree. An explicit `vi.spyOn(AbortSignal, "timeout")` was added to tests that previously relied on spy state leaking from a preceding test — a leak that `restoreMocks` now correctly prevents.

Deprecated Vitest matcher aliases such as `toBeCalled` and `toBeCalledTimes` were replaced with `toHaveBeenCalled` and `toHaveBeenCalledTimes`.

The `MockCloudflare` mock in `create-wrangler-config.spec.ts` was rewritten using a `class` declaration to properly support static properties such as `NotFoundError`. A trailing `//# sourceMappingURL` comment was removed from an inline snapshot in `use-cache.spec.ts` as it is no longer emitted by the updated toolchain. An `unknown` intermediate cast was added for the `Readable.toWeb()` return value in `populate-cache.ts` to satisfy the stricter TypeScript types shipped with the updated `@types/node`.
