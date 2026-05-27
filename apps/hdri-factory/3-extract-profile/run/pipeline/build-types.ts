/*
<MODULE_CONTRACT>
<purpose>Defines types for the site profile pipeline build context and steps.</purpose>
<keywords>pipeline, types, build</keywords>
<responsibilities>
  <item>Defines the structure for pipeline build context.</item>
  <item>Specifies types for site profile pipeline steps and phases.</item>
  <item>Provides a factory type for creating pipeline members.</item>
</responsibilities>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineBuildContext">Defines the context for pipeline builds.</entry>
  <entry key="SiteProfilePipelineStep">Represents a step in the site profile pipeline.</entry>
  <entry key="PipelineMemberFactory">Factory type for creating pipeline members.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { PipelineStep } from '@org/pipeline-core/step';
import type { PipelineContext } from './types.js';

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type SiteProfilePipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember =
  | SiteProfilePipelineStep
  | PipelinePhase<SiteProfilePipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;

