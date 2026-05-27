/*
<MODULE_CONTRACT>
<purpose>Main entry point for the 3-extract-profile pipeline.</purpose>
<keywords>profile, entry, pipeline</keywords>
<responsibilities>
  <item>Imports auto-env for environment variable initialisation.</item>
  <item>Delegates execution to the run-app orchestrator.</item>
</responsibilities>
<non-goals>
  <item>Do not contain pipeline logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="main.ts">Entry point that bootstraps the extract-profile pipeline via runApp.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/

import '@org/observatory-crypto/auto-env';
import { runApp } from './app/run-app.js';

await runApp();