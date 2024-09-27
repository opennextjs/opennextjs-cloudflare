import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

export default [
  {
    ignores: ["dist", "**/test-snapshots", "**/test-fixtures"]
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
  },
  {
    languageOptions: {
      globals: globals.node
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      unicorn: eslintPluginUnicorn,
    },
    "rules": {
      "@typescript-eslint/ban-ts-comment": "off",
      "unicorn/prefer-node-protocol": "error"
    }
  }
];
