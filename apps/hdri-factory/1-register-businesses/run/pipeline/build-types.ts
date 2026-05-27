/*
<MODULE_CONTRACT>
<purpose>Defines types for the register-businesses pipeline build context and steps.</purpose>
<keywords>pipeline, types, build</keywords>
<responsibilities>
  <item>Defines the structure for pipeline build context.</item>
  <item>Specifies types for register-businesses pipeline steps and phases.</item>
  <item>Provides a factory type for creating pipeline members.</item>
</responsibilities>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineBuildContext">Defines the context for pipeline builds.</entry>
  <entry key="RegisterBusinessesPipelineStep">Represents a step in the register-businesses pipeline.</entry>
  <entry key="PipelineMemberFactory">Factory type for creating pipeline members.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Add PipelineBuildContext, PipelineMember, and PipelineMemberFactory for declaration-driven pipeline.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { Gogol } from './Gogol.js';

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type RegisterBusinessesPipelineStep = Gogol;

export type PipelineMember =
  | RegisterBusinessesPipelineStep
  | PipelinePhase<RegisterBusinessesPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
