/*
<MODULE_CONTRACT>
<purpose>Entrypoint for the digital-observatory pipeline application.</purpose>
<keywords>entrypoint, main, pipeline</keywords>
<responsibilities>
  <item>Imports environment auto-configuration from observatory-crypto.</item>
  <item>Bootstraps and runs the application via runApp.</item>
</responsibilities>
<non-goals>
  <item>Do not contain pipeline logic, gogol definitions, or configuration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runApp">Application bootstrap and execution.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation of digital-observatory entrypoint.</item>
</CHANGE_SUMMARY>
*/
import '@org/observatory-crypto/auto-env';
import { runApp } from './app/run-app.js';

await runApp();