/*
<MODULE_CONTRACT>
<purpose>Configures Vitest to include specific test files for execution.</purpose>
<non-goals>
  <item>Does not execute the tests themselves.</item>
  <item>Does not configure other tools or environments.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial configuration setup for test inclusion.</item>
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
