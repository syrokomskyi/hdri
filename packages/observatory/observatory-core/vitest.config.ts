/*
<MODULE_CONTRACT>
<purpose>Configures Vitest to include test files located in the 'src' directory for testing purposes.</purpose>
<non-goals>
  <item>Does not execute the tests.</item>
  <item>Does not configure other testing frameworks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial configuration setup for including test files.</item>
  <item>Added resolve.conditions ['@syrokomskyi/source'] so Vitest resolves workspace packages from source during direct test runs.</item>
</CHANGE_SUMMARY>
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["@syrokomskyi/source"],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
