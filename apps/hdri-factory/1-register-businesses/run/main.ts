/*
<MODULE_CONTRACT>
<purpose>Main entry point for the 1-register-businesses pipeline stage.</purpose>
<keywords>business registration, upstream merge, deterministic asset IDs</keywords>
<responsibilities>
  <item>Reads sourceToken from shared factory brief.md, other settings from local brief.md.</item>
  <item>Bootstraps the pipeline engine with gogols for each processing step.</item>
  <item>Delegates execution to the pipeline engine for proper console formatting.</item>
</responsibilities>
<non-goals>
  <item>Does not modify upstream core.db files.</item>
  <item>Does not implement step logic directly (handled by gogols).</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="main.ts">Pipeline entry point that bootstraps and runs the engine.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Two-file brief pattern: reads sourceToken from shared factory-level brief.md, other settings from local app-level brief.md.</item>
  <item>Use shared mergeBriefFrontmatter from @org/pipeline-node for merging root + local brief frontmatter.</item>
  <item>inputDir now points to shared factory-level .input; briefInputDir used for local brief.md.</item>
  <item>Discover upstream core_YYYY.db (not core_&lt;sourceToken&gt;.db) to match 0-harvest-source naming.</item>
  <item>Emit 0-discover-cores/discovered-cores.json so the output layout matches the B.5 spec.</item>
  <item>Create placeholder 1-merge-registry/ and 2-mint-asset-ids/ dirs so the output layout matches the B.5 spec.</item>
  <item>Write concrete Markdown and JSON artifacts for every numbered step and use shared pipeline console formatting.</item>
  <item>Make registry merging idempotent by aggregating domains before writing sites_count.</item>
  <item>Fix database naming from registry_<sourceToken>.db to registry_<year>.db to match standard pattern.</item>
  <item>Refactor monolithic script into pipeline engine with individual gogols.</item>
  <item>Use formatPipelineStart, formatPipelineOverview, formatPipelineFinished from @org/pipeline-core.</item>
  <item>Each gogol now has proper guide metadata for step-level console output via pipeline engine.</item>
  <item>Read coreDbPath from brief, substitute ${DEVICE_ID}, and derive upstreamHarvestOutputRoot dynamically instead of hardcoding '0-harvest-source' in config.ts.</item>
  <item>Simplify main.ts to delegate orchestration to run-app.ts.</item>
</CHANGE_SUMMARY>
*/

import '@org/observatory-crypto/auto-env';
import { runApp } from './app/run-app.js';

await runApp();
