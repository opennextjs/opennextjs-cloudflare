---
"@opennextjs/cloudflare": patch
---

fix: harden `runWrangler` against shell injection and silence Node.js DEP0190.

`runWrangler` previously called `spawnSync` with `shell: true` while interpolating
flag values into single-string array entries (e.g. `` `--env ${wranglerOpts.environment}` ``).
With `shell: true`, Node.js joins the arguments into a shell command string without
escaping, so a value containing shell metacharacters (`;`, `&&`, `$(...)`, backticks,
etc.) could break out of its intended argument boundary. Node.js 22 added `DEP0190`
specifically to flag this pattern, and that warning surfaced on every `opennextjs-cloudflare deploy`
invoked through `wrangler-action` on Node 22+.

Each flag/value pair is now passed as separate array entries, and `shell` is set to
`false` on POSIX (where the package manager binary can be invoked directly). `shell: true`
is retained on Windows so the package manager's `.cmd` shim still resolves via `cmd.exe`,
but values are no longer interpolated into the shell command, so the injection vector
is closed on every platform.

Closes [#1182](https://github.com/opennextjs/opennextjs-cloudflare/issues/1182).
