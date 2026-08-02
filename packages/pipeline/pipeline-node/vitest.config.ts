/*
<MODULE_CONTRACT>
<purpose>Configure Vitest testing environment for TypeScript project</purpose>
<non-goals>
  <item>Provide implementation details for individual tests</item>
  <item>Handle production environment configurations</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial setup for Vitest configuration with custom conditions</item>
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
