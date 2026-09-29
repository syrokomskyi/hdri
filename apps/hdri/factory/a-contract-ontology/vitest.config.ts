/*
<MODULE_CONTRACT>
  <purpose>Configure Vitest to exercise contract ontology translation and recovery against workspace source modules.</purpose>
  <non-goals><item>Does not run production collection or certify a scientific quarter.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0106: register translation coverage and existing bridge regression tests.</item>
</CHANGE_SUMMARY>
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@syrokomskyi/source"] },
  test: {
    include: ["apps/hdri/factory/a-contract-ontology/run/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
