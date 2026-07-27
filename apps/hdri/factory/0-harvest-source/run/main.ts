/*
<MODULE_CONTRACT>
<purpose>Application entry point for the catalog-harvest pipeline — this module handles main operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement business logic or parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import { runApp } from "./app/run-app.js";

await runApp();
