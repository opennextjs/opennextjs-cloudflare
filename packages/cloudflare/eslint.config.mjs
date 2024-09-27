import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist", "**/test-snapshots", "**/test-fixtures"]
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
  },
  {
    languageOptions: { globals: globals.node },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    "rules": {
      "@typescript-eslint/ban-ts-comment": "off"
    }
  }
];
