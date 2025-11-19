// eslint.config.mjs
// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tsEslint from "typescript-eslint";

export default defineConfig(
  eslint.configs.recommended,
  tsEslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: ["./tsconfig.json"],
      },
    },
    rules: {
      // project-specific overrides
      "no-console": "warn",
      semi: ["error", "always"],
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
);
