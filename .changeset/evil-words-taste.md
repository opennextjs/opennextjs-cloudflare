---
"@opennextjs/cloudflare": patch
---

fix(tsconfig): make tsconfig files compatible with TypeScript 6.0

This change updates tsconfig files to fix the following TypeScript 6.0 errors:

```text
Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.
  Visit https://aka.ms/ts6 for migration information.

The common source directory of 'tsconfig.json' is './src'. The 'rootDir' setting must be explicitly set to this or another path to adjust your output's file layout.
  Visit https://aka.ms/ts6 for migration information.
```
