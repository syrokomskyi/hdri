/*
<MODULE_CONTRACT>
<purpose>Defines types for building the observatory pipeline.</purpose>
<keywords>types, pipeline, build context</keywords>
<responsibilities>
  <item>Defines PipelineBuildContext for declaration-driven assembly.</item>
  <item>Defines step and member union types.</item>
</responsibilities>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineBuildContext">Context passed during pipeline assembly.</entry>
  <entry key="ObservatoryPipelineStep">App-level step type alias.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { PipelineStep } from '@org/pipeline-core/step';
import type { PipelineContext } from './types';

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type ObservatoryPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember =
  | ObservatoryPipelineStep
  | PipelinePhase<ObservatoryPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
