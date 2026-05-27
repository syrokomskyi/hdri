/**
 * @file Prettier configuration for Webgogol monorepo.
 * @module_contract
 *   - FORMAT: esm
 *   - PURPOSE: Code formatting rules for apps/* and packages/*
 */

/** @type {import("prettier").Config} */
const config = {
  // Indentation: 2 spaces (per AGENTS.md)
  tabWidth: 2,
  useTabs: false,

  // Line length and wrapping
  printWidth: 100,
  proseWrap: "preserve",

  // Quotes and commas
  singleQuote: false,
  trailingComma: "all",
  semi: true,

  // JSX
  jsxSingleQuote: false,
  bracketSameLine: false,

  // Whitespace
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",

  // Parser overrides for specific file types
  overrides: [
    {
      files: "*.json",
      options: {
        parser: "json",
      },
    },
    {
      files: "*.md",
      options: {
        parser: "markdown",
        proseWrap: "never",
        embeddedLanguageFormatting: "off",
      },
    },
    {
      files: "*.{yml,yaml}",
      options: {
        parser: "yaml",
      },
    },
    {
      files: "*.astro",
      options: {
        parser: "astro",
      },
    },
  ],

  // Plugins
  plugins: ["prettier-plugin-astro"],
};

export default config;
