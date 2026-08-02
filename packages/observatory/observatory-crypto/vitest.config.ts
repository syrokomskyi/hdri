/*
<MODULE_CONTRACT>
<purpose>Configure Vitest to include test files matching a specified pattern in the source directory.</purpose>
<non-goals>
  <item>Does not execute or run the tests themselves.</item>
  <item>Does not provide configuration for production builds.</item>
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
