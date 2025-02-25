---
"@opennextjs/cloudflare": patch
---

remove `eval` calls introduced by `depd` wrapped functions

Some dependencies of Next.js (`raw-body` and `send`) use `depd` to deprecate some of their functions,
`depd` uses `eval` to generate a deprecated version of such functions, this causes `eval` warnings in
the terminal even if these functions are never called, the changes here by patching the depd `wrapfunction`
function so that it still retains the same type of behavior but without using `eval`
