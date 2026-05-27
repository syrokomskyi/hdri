/*
<MODULE_CONTRACT>
<purpose>Re-exports context creation for the observatory pipeline.</purpose>
<keywords>context, exports</keywords>
<responsibilities>
  <item>Exports createPipelineContext and PipelineClientsForContext.</item>
</responsibilities>
<non-goals>
  <item>Do not implement context creation logic directly.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createPipelineContext">Context factory.</entry>
  <entry key="PipelineClientsForContext">Client type alias.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
</CHANGE_SUMMARY>
*/

export { createPipelineContext } from './create-context.shared';

export type { PipelineClientsForContext } from './create-context.shared';
