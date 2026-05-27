/*
<MODULE_CONTRACT>
<purpose>Defines types for building the contract-ontology pipeline.</purpose>
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
  <entry key="ContractOntologyPipelineStep">App-level step type alias.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { PipelineStep } from '@org/pipeline-core/step';
import type { PipelineContext } from './types.js';

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type ContractOntologyPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember =
  | ContractOntologyPipelineStep
  | PipelinePhase<ContractOntologyPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
