/*
<MODULE_CONTRACT>
<purpose>Provides output path helpers for the check-liveness pipeline databases.</purpose>
<keywords>paths, output, database, directory</keywords>
<responsibilities>
  <item>Generates the database output directory path.</item>
  <item>Generates the full liveness database file path scoped by year.</item>
</responsibilities>
<non-goals>
  <item>Does not manage input or temporary paths.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="getDbDir">Returns the directory path for database output files.</entry>
  <entry key="getLivenessDbPath">Returns the full path to the liveness database file for a given year.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from 'node:path';
import { outputRootDir } from './config.js';

// ---------------------------------------------------------------------------
// Output paths
// ---------------------------------------------------------------------------

export const getDbDir = (): string => path.join(outputRootDir, 'data', 'db');

export const getLivenessDbPath = (year: number): string => path.join(getDbDir(), `liveness_${year}.db`);

