/*
<MODULE_CONTRACT>
<purpose>Configure and define workspace settings for Vitest in a TypeScript environment.</purpose>
<non-goals>
  <item>Does not execute tests or handle test results.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial setup for defining workspace configurations using Vitest.</item>
</CHANGE_SUMMARY>
*/

import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "**/vite.config.{mjs,js,ts,mts}",
  "**/vitest.config.{mjs,js,ts,mts}",
]);
