/*
<MODULE_CONTRACT>
<purpose>Facilitates the construction and execution of the register-businesses pipeline.</purpose>
<keywords>pipeline, construction, gogols, registry</keywords>
<responsibilities>
  <item>Defines the pipeline structure based on loaded declarations.</item>
  <item>Creates execution summary and guide for the pipeline.</item>
  <item>Provides factory functions for creating gogols and the pipeline definition.</item>
</responsibilities>
<non-goals>
  <item>Do not handle pipeline execution directly.</item>
  <item>Do not manage external configuration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createPipeline">Constructs the pipeline from declaration.</entry>
  <entry key="createGogols">Retrieves the steps of the pipeline.</entry>
  <entry key="createExecutionSummary">Summarizes the pipeline purpose.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Add VerifyUpstreamGogol as first pipeline step for upstream signature verification.</item>
  <item>Refactor to declaration-driven pipeline loading.</item>
</CHANGE_SUMMARY>
*/

import { definePipeline, type PipelineDefinition } from '@org/pipeline-core';
import {
  type DeclarationMemberReference,
  PIPELINE_DECLARATION_LANGUAGE,
  loadPipelineDeclaration,
} from './pipeline/declaration.js';
import type { RegisterBusinessesPipelineStep, PipelineBuildContext } from './pipeline/build-types.js';
import { createPhaseById, isPhaseId } from './pipeline/phase-registry.js';

type AppPipelineDefinition = PipelineDefinition<RegisterBusinessesPipelineStep>;

const createExecutionSummary = (): string =>
  [
    'Register-businesses T1 pipeline: verifies upstream 0-harvest-source signatures,',
    'collects distinct business domains from sibling core DBs,',
    'deduplicates them into a device-local registry, mints deterministic da-* asset IDs,',
    'and signs the current registry snapshot for downstream verification.',
  ].join(' ');

export const createPipeline = (): AppPipelineDefinition => {
  const declarationLanguage = PIPELINE_DECLARATION_LANGUAGE;
  const declaration = loadPipelineDeclaration({ language: declarationLanguage });
  const buildContext: PipelineBuildContext = { declarationLanguage };

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

export const createGogols = (): RegisterBusinessesPipelineStep[] => createPipeline().steps;
