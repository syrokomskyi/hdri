/*
<MODULE_CONTRACT>
<purpose>Assembles the contract-ontology pipeline from markdown declarations.</purpose>
<keywords>pipeline, assembly, declarations</keywords>
<responsibilities>
  <item>Loads pipeline declarations and resolves phases.</item>
  <item>Returns a PipelineDefinition for the engine.</item>
</responsibilities>
<non-goals>
  <item>Do not instantiate gogols directly — use the registry.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createPipeline">Loads declarations, builds phases, returns definition.</entry>
  <entry key="createGogols">Convenience: returns flattened step list.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import { definePipeline, type PipelineDefinition } from '@org/pipeline-core';
import {
  type DeclarationMemberReference,
  PIPELINE_DECLARATION_LANGUAGE,
  loadPipelineDeclaration,
} from './pipeline/declaration.js';
import type { ContractOntologyPipelineStep, PipelineBuildContext } from './pipeline/build-types.js';
import { createPhaseById, isPhaseId } from './pipeline/phase-registry.js';

type AppPipelineDefinition = PipelineDefinition<ContractOntologyPipelineStep>;

const createExecutionSummary = (): string =>
  'Contract Ontology pipeline: discover sources → translate ext_* rows → resolve conflicts → sign → emit. ' +
  'Driven by markdown declarations and executed on the shared pipeline engine.';

export const createPipeline = (): AppPipelineDefinition => {
  const declarationLanguage = PIPELINE_DECLARATION_LANGUAGE;
  const declaration = loadPipelineDeclaration({
    language: declarationLanguage,
  });
  const buildContext: PipelineBuildContext = {
    declarationLanguage,
  };
  const phases = declaration.members.map((member: DeclarationMemberReference) => {
    if (!isPhaseId(member.id)) {
      throw new Error(`Top-level pipeline member must be a phase id: ${member.id}`);
    }
    return createPhaseById(member.id, buildContext);
  });

  return definePipeline({
    title: declaration.title,
    summary: createExecutionSummary(),
    quickStart: declaration.quickStart,
    operatingRules: declaration.operatingRules,
    phases,
  });
};

export const createGogols = (): ContractOntologyPipelineStep[] =>
  createPipeline().steps;
