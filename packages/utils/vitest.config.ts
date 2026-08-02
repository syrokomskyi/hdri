/*
<MODULE_CONTRACT>
<purpose>Configure and set up testing environment for TypeScript project using Vitest.</purpose>
<non-goals>
  <item>Does not execute tests or provide test results.</item>
  <item>Does not handle production build configurations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial setup for Vitest configuration with custom conditions and test environment.</item>
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
