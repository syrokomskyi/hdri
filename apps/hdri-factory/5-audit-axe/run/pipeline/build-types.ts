/*
<MODULE_CONTRACT>
<purpose>Defines types for the axe audit pipeline build context and steps.</purpose>
<keywords>pipeline, types, build</keywords>
<responsibilities>
  <item>Defines the structure for pipeline build context.</item>
  <item>Specifies types for axe audit pipeline steps and phases.</item>
  <item>Provides a factory type for creating pipeline members.</item>
</responsibilities>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineBuildContext">Defines the context for pipeline builds.</entry>
  <entry key="SiteDeepAuditPipelineStep">Represents a step in the deep audit pipeline (Axe).</entry>
  <entry key="PipelineMemberFactory">Factory type for creating pipeline members.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
  <item>Rename AxeAuditPipelineStep to SiteDeepAuditPipelineStep for gogol compatibility.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { PipelineStep } from '@org/pipeline-core/step';
import type { PipelineContext } from './types.js';

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type SiteDeepAuditPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember =
  | SiteDeepAuditPipelineStep
  | PipelinePhase<SiteDeepAuditPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;

