/*
<MODULE_CONTRACT>
<purpose>Provides output path helpers for the check-liveness pipeline databases — this module handles paths operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not manage input or temporary paths.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import { outputRootDir } from "./config.js";

// ---------------------------------------------------------------------------
// Output paths
// ---------------------------------------------------------------------------

export const getDbDir = (): string => path.join(outputRootDir, "data", "db");

export const getLivenessDbPath = (period: string): string =>
  path.join(getDbDir(), `liveness-${period}.db`);
