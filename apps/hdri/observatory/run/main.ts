/*
<MODULE_CONTRACT>
<purpose>Entrypoint for the observatory pipeline application — this module handles main operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not contain pipeline logic, gogol definitions, or configuration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.summary.trim; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/
import "@syrokomskyi/observatory-crypto/auto-env";
import { parseRunOptions } from "@warpgogol/pipeline-node/cli";
import { runApp } from "./app/run-app.js";

const options = parseRunOptions(process.argv.slice(2));
options.admissionTrustedKeysSha256 ??= process.env.HDRI_OPERATIONAL_ADMISSION_TRUST_SHA256;
await runApp(options);
