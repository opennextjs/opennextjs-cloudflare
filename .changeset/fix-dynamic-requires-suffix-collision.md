---
"@opennextjs/cloudflare": patch
---

fix: sort `.endsWith()` checks by path length descending to prevent suffix collisions in dynamic requires

Routes whose paths are suffixes of other routes (e.g. `/test/app` vs `/`) were resolved incorrectly because the shorter path matched first in the generated `.endsWith()` chain. Sorting by path length descending ensures more specific (longer) paths are always checked first.

Fixes #1156.
