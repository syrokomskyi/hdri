/*
<MODULE_CONTRACT>
<purpose>This module configures Vitest to run tests in a Node.js environment, including all test files within the source directory.</purpose>
<non-goals>
  <item>This module does not execute tests or handle test results.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial setup of Vitest configuration for Node.js environment.</item>
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
