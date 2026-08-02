/*
<MODULE_CONTRACT>
<purpose>This module configures the Vitest testing framework for running TypeScript test files with specific timeout settings to ensure reliable execution.</purpose>
<non-goals>
  <item>This module does not handle the actual implementation of test cases.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Configured test and hook timeouts to 30000ms to prevent flaky timeouts during parallel execution.</item>
  <item>Added resolve.conditions ['@syrokomskyi/source'] so Vitest resolves workspace packages from source when tests are run directly without a prior build.</item>
</CHANGE_SUMMARY>
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["@syrokomskyi/source"],
  },
  test: {
    include: ["run/**/*.test.ts"],
    // Several suites do real DuckDB + Parquet round-trips (rebuild-from-vault, tier
    // recoverability, snapshot freeze, the DR-runbook drill). Spinning up DuckDB and
    // reading real Parquet takes seconds, and under vitest's parallel file execution on
    // a loaded machine they exceed the default 5s/10s and time out flakily. Give the I/O
    // headroom so the durability gate (also run in CI) is deterministic, not a coin flip.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
