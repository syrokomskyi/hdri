/*
<MODULE_CONTRACT>
  <purpose>Include liveness policy tests in workspace test runs without silently skipping this collector.</purpose>
  <non-goals><item>Does not run live collection or grant qualification from policy unit tests.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115 review: register the existing liveness tests in the collector workspace.</item></CHANGE_SUMMARY>
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["apps/hdri/factory/2-check-liveness/run/**/*.test.ts"] },
});
