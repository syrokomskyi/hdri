/*
<MODULE_CONTRACT>
<purpose>Facilitates the construction and execution of the liveness check pipeline.</purpose>
<keywords>pipeline, liveness, construction</keywords>
<responsibilities>
  <item>Defines the pipeline structure based on loaded declarations.</item>
  <item>Creates execution summary and phases for the pipeline.</item>
</responsibilities>
<non-goals>
  <item>Do not handle pipeline execution directly.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createPipeline">Constructs the pipeline from declaration.</entry>
  <entry key="createGogols">Retrieves the steps of the pipeline.</entry>
  <entry key="createExecutionSummary">Summarizes the pipeline purpose.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/

import { definePipeline, type PipelineDefinition } from '@org/pipeline-core';
import {
  type DeclarationMemberReference,
  PIPELINE_DECLARATION_LANGUAGE,
  loadPipelineDeclaration,
} from './pipeline/declaration.js';
import type { SiteLivenessPipelineStep, PipelineBuildContext } from './pipeline/build-types.js';
import { createPhaseById, isPhaseId } from './pipeline/phase-registry.js';

type AppPipelineDefinition = PipelineDefinition<SiteLivenessPipelineStep>;

const createExecutionSummary = (): string =>
  [
    'Site-liveness T1 pipeline: reads all domains from registry.db, checks HTTP/HTTPS',
    'reachability for each domain, writes liveness_checks to liveness.db,',
    'and produces a SHA-256 snapshot for downstream integrity verification.',
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

export const createGogols = (): SiteLivenessPipelineStep[] => createPipeline().steps;

