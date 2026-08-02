/*
<MODULE_CONTRACT>
<purpose>Configures Vitest testing environment for TypeScript project, specifying test file inclusion and execution context.</purpose>
<non-goals>
  <item>Does not execute or run the tests themselves.</item>
  <item>Does not configure non-test-related build settings.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial configuration setup for Vitest with TypeScript support.</item>
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
    environment: "node",
  },
});
