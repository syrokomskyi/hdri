/*
<MODULE_CONTRACT>
<purpose>Entry point for the contract-ontology pipeline.</purpose>
<keywords>entry point, pipeline</keywords>
<responsibilities>
  <item>Loads auto-env and invokes runApp.</item>
</responsibilities>
<non-goals>
  <item>Do not add logic here — delegate to run-app.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="main">Main entry point, delegates to runApp.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Rewritten as thin entry point for declaration-driven pipeline.</item>
</CHANGE_SUMMARY>
*/

import '@org/observatory-crypto/auto-env';
import { runApp } from './app/run-app.js';

await runApp();
