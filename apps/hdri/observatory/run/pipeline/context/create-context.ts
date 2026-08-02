/*
<MODULE_CONTRACT>
<purpose>Re-exports context creation for the observatory pipeline — this module handles create-context operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement context creation logic directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for observatory.</item>
</CHANGE_SUMMARY>
*/

export { createPipelineContext } from "./create-context.shared";

export type { PipelineClientsForContext } from "./create-context.shared";
