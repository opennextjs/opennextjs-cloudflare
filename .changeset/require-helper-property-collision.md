---
"@opennextjs/cloudflare": patch
---

fix: only rename esbuild's `__require` helper, not `__require` properties

Restoring esbuild's `__require` helper to a bare `require` was a text replacement over the
whole bundle, so it also rewrote unrelated `__require` members. `@rollup/plugin-commonjs`
emits `exports.__require` lazy-init wrappers, whose declarations the replacement never
matched — leaving the two halves disagreeing and throwing
`TypeError: __webpack_require__(...).require is not a function` when such a package was
imported during SSR. Packages built that way (for example `smartystreets-javascript-sdk`)
500'd every route. The rename now skips property accesses.
