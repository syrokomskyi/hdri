/*
<MODULE_CONTRACT>
<purpose>Entry point for the contract-ontology pipeline — this module handles main operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not add logic here — delegate to run-app.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Rewritten as thin entry point for declaration-driven pipeline.</item>
  <item>RFC-0106: add --verify-inputs read-only diagnostic command.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import { runApp } from "./app/run-app.js";
import { verifyInputs } from "./app/verify-inputs.js";

const args = process.argv.slice(2);
if (args.includes("--verify-inputs")) {
  await verifyInputs(args);
} else {
  await runApp();
}
