/*
<MODULE_CONTRACT>
<purpose>Facilitates the configuration of the GRACE tooling pipeline for register-businesses documentation.</purpose>
<keywords>kernel, configuration, tooling, GRACE</keywords>
<responsibilities>
  <item>Defines the register-businesses specific GRACE kernel configuration.</item>
  <item>Registers commands for backfilling, inventory scanning, and validation of GRACE scaffolding.</item>
  <item>Integrates with the standard GRACE pipeline for documentation processes.</item>
</responsibilities>
<non-goals>
  <item>Do not handle business registry runtime logic.</item>
  <item>Do not manage external service orchestration beyond command execution.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="grace.commands">Command registration for GRACE tooling.</entry>
  <entry key="grace.pipelines">Integration with the GRACE standard pipeline.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial kernel configuration for register-businesses GRACE compliance.</item>
</CHANGE_SUMMARY>
*/
/* <GRACE_BLOCK id="kernel.config"> */
import { defineKernelConfig } from "@gogol/site-kernel";
import { runGraceInventory, runGraceValidation, STANDARD_GRACE_PIPELINE } from "@gogol/site-kernel-checks";
import { runGraceAnchorBackfill, runGraceBackfill } from "@gogol/site-kernel-codegen";

export default defineKernelConfig({
  name: "register-businesses",
  description: "Register Businesses pipeline OS — GRACE documentation tooling",
  modules: [
    {
      name: "grace",
      version: "0.1.0",
      register(registry) {
        registry.registerCommand({
          name: "grace.backfill",
          description: "Generate GRACE MODULE_CONTRACT/MODULE_MAP/CHANGE_SUMMARY headers via LLM.",
          scope: "app",
          mutatesState: true,
          requiresNetwork: true,
          execute: runGraceBackfill,
        });
        registry.registerCommand({
          name: "grace.anchors",
          description: "Backfill GRACE_BLOCK anchor markers and @ai-invariant lines via LLM.",
          scope: "app",
          mutatesState: true,
          requiresNetwork: true,
          execute: runGraceAnchorBackfill,
        });
        registry.registerCommand({
          name: "grace.inventory",
          description: "Scan authored source files and emit the GRACE inventory XML.",
          scope: "app",
          execute: runGraceInventory,
        });
        registry.registerCommand({
          name: "grace.validate",
          description: "Validate GRACE scaffolding compliance across authored source files.",
          scope: "app",
          execute: runGraceValidation,
        });
      },
    },
  ],
  pipelines: {
    grace: [...STANDARD_GRACE_PIPELINE],
  },
});
/* </GRACE_BLOCK> */
