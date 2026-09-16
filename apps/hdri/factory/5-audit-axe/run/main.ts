/*
<MODULE_CONTRACT>
<purpose>Main entry point for the 5-audit-axe pipeline — this module handles main operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not contain pipeline logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import { parseRunOptions } from "@warpgogol/pipeline-node/cli";
import { runApp } from "./app/run-app.js";

const options = parseRunOptions(process.argv.slice(2));
options.admissionTrustedKeysSha256 ??= process.env.HDRI_OPERATIONAL_ADMISSION_TRUST_SHA256;
await runApp(options);
