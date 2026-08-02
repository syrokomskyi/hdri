/*
<MODULE_CONTRACT>
<purpose>Entrypoint for the observatory pipeline application — this module handles main operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not contain pipeline logic, gogol definitions, or configuration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation of observatory entrypoint.</item>
</CHANGE_SUMMARY>
*/
import "@syrokomskyi/observatory-crypto/auto-env";
import { runApp } from "./app/run-app.js";

await runApp();
