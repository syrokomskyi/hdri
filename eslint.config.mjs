import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { backpressurePlugin } from "./eslint-rules/no-unguarded-stream-write.mjs";

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "**/build",
      "**/.output",
      "**/node_modules",
      "**/vite.config.*.timestamp*",
      "**/vitest.config.*.timestamp*",
      "**/spec",
      "spec",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["packages/utils/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@syrokomskyi/strings", "@syrokomskyi/pipeline-*"],
        },
      ],
    },
  },
  {
    files: ["packages/strings/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@syrokomskyi/pipeline-*"] }],
    },
  },
  {
    plugins: { backpressure: backpressurePlugin },
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    rules: {
      "backpressure/no-unguarded-stream-write": "error",
    },
  },
);
