/*
<MODULE_CONTRACT>
<purpose>Facilitates the construction and execution of the axe audit pipeline.</purpose>
<keywords>pipeline, axe, audit</keywords>
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
  <item>Fix createExecutionSummary: remove stale cohort/sub-sample language.</item>
</CHANGE_SUMMARY>
*/

import { definePipeline, type PipelineDefinition } from '@org/pipeline-core';
import {
  type DeclarationMemberReference,
  PIPELINE_DECLARATION_LANGUAGE,
  loadPipelineDeclaration,
} from './pipeline/declaration.js';
import type { SiteDeepAuditPipelineStep, PipelineBuildContext } from './pipeline/build-types.js';
import { createPhaseById, isPhaseId } from './pipeline/phase-registry.js';

type AppPipelineDefinition = PipelineDefinition<SiteDeepAuditPipelineStep>;

const createExecutionSummary = (): string =>
  [
    'Site axe audit: queries registry.db for all live sites,',
    'runs axe-core per site through a rate-limited executor, stores',
    'raw JSON reports in CAS on disk, and persists per-tool metrics to axe_YYYY.db.',
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

export const createGogols = (): SiteDeepAuditPipelineStep[] => createPipeline().steps;

