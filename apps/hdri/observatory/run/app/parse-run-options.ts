/*
<MODULE_CONTRACT>
<purpose>Re-exports shared CLI option parsing for the observatory pipeline.</purpose>
<non-goals>
  <item>Do not implement business logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled CLI parser with shared parseRunOptions from @syrokomskyi/pipeline-node/cli.</item>
</CHANGE_SUMMARY>
*/

export { parseRunOptions } from "@syrokomskyi/pipeline-node/cli";
export type { PipelineRunOptions } from "@syrokomskyi/pipeline-core";
