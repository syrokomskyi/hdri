/*
<MODULE_CONTRACT>
<purpose>Application entry point for the catalog-harvest pipeline — this module handles main operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement business logic or parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.summary.trim; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import { parseRunOptions } from "@warpgogol/pipeline-node/cli";
import { runApp } from "./app/run-app.js";

// --first-quarter is consumed by run-app's process.argv check; the shared
// parser is strict and must not see it.
const options = parseRunOptions(process.argv.slice(2).filter((arg) => arg !== "--first-quarter"));
options.admissionTrustedKeysSha256 ??= process.env.HDRI_OPERATIONAL_ADMISSION_TRUST_SHA256;
await runApp(options);
