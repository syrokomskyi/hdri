/*
<MODULE_CONTRACT>
<purpose>Application entry point for the catalog-harvest pipeline.</purpose>
<keywords>entry point, bootstrap, pipeline</keywords>
<responsibilities>
  <item>Initializes the application environment.</item>
  <item>Delegates to the app runner.</item>
</responsibilities>
<non-goals>
  <item>Do not implement business logic or parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="main">Entry point that boots the pipeline.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/

import '@org/observatory-crypto/auto-env';
import { runApp } from './app/run-app.js';

await runApp();