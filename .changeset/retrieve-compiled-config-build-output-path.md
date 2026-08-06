---
"@opennextjs/cloudflare": patch
---

Fix `deploy`/`preview`/`upload`/`populateCache` failing when `buildOutputPath` is set

`retrieveCompiledConfig` looked for the compiled config under a hardcoded
`<cwd>/.open-next/.build/`, which does not follow the `buildOutputPath` config.
Every command that goes through it therefore exited with `Could not find
compiled Open Next config, did you run the build command?` right after a
successful build. `build` itself was unaffected because it compiles the config
from source, so the failure only showed up at deploy time.

The compiled path cannot simply be prefixed with `buildOutputPath` — that value
lives in the very config being loaded. When the file is missing, the config is
now recompiled from source instead (the same path `build` takes;
`compileOpenNextConfig` emits to a temp dir, so nothing lands in the project).
