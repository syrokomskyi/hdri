/*
<MODULE_CONTRACT>
<purpose>Configure Vitest for TypeScript project testing</purpose>
<non-goals>
  <item>Provide runtime environment beyond Node.js</item>
  <item>Include non-test files in the test suite</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial configuration setup for Vitest</item>
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
