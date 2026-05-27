/*
<MODULE_CONTRACT>
<purpose>Facilitates the construction and execution of the site profile pipeline.</purpose>
<keywords>pipeline, profile, construction</keywords>
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
import type { SiteProfilePipelineStep, PipelineBuildContext } from './pipeline/build-types.js';
import { createPhaseById, isPhaseId } from './pipeline/phase-registry.js';

type AppPipelineDefinition = PipelineDefinition<SiteProfilePipelineStep>;

const createExecutionSummary = (): string =>
  [
    'Site-profile T2 pipeline: reads live domains from liveness.db, fetches',
    'homepages, stores HTML in CAS, extracts rule-based signals (impressum,',
    'datenschutz, contacts), and writes results to pages_YYYY.db + registry.db',
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

export const createGogols = (): SiteProfilePipelineStep[] => createPipeline().steps;

