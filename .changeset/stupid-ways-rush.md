---
"@opennextjs/cloudflare": patch
---

fix: detect object-valued conditions

The pre-existing build condition transform logic had subtle errors:

- failed to recognize object conditions
  (e.g. "workerd": { "import": ..., "require": ... })
- sibling pruning only applied to strings, not objects

Now, we fully support object conditions. Furthermore, we prune siblings,
unless its subtree also contains the build condition.
