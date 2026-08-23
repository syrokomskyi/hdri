/**
 * <MODULE_CONTRACT><purpose>Provide vitest config behavior for the apps hdri factory 0-harvest-source subsystem and its direct callers.</purpose><non-goals><item>Do not define unrelated cross-workspace policy or orchestration behavior.</item></non-goals></MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing vitest.config module contract for Compass-aware maintenance.</item>
</CHANGE_SUMMARY>
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/0-harvest-source/run/**/*.test.ts"],
  },
});
