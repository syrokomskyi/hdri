/*
<MODULE_CONTRACT>
<purpose>Configure and manage test settings for TypeScript projects using Vitest.</purpose>
<non-goals>
  <item>Does not execute tests or provide test results.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial configuration setup for Vitest with test inclusion and timeout settings.</item>
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
    testTimeout: 15_000,
  },
});
