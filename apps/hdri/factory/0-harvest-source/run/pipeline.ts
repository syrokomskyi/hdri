/*
<MODULE_CONTRACT>
<purpose>Facilitates the construction and execution of a data source ingestion pipeline for business directory data processing.</purpose>
<non-goals>
  <item>Do not handle raw data parsing or transformation logic directly.</item>
  <item>Do not manage external configuration or transport orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill COMPASS scaffolding to enhance navigability and maintainability of the pipeline module.</item>
  <item>Update terminology from 'catalog' to 'sources' to better represent the variety of input data.</item>
</CHANGE_SUMMARY>
*/

import { definePipeline, type PipelineDefinition } from "@syrokomskyi/pipeline-core";
import {
  type DeclarationMemberReference,
  PIPELINE_DECLARATION_LANGUAGE,
  loadPipelineDeclaration,
} from "./pipeline/declaration.js";
import type { CatalogHarvestPipelineStep, PipelineBuildContext } from "./pipeline/build-types.js";
import { createPhaseById, isPhaseId } from "./pipeline/phase-registry.js";

type AppPipelineDefinition = PipelineDefinition<CatalogHarvestPipelineStep>;

const createExecutionSummary = (): string =>
  [
    "Source-ingestion T0 pipeline: ingests CSV/HTML business directory sources,",
    "normalises domains, filters stop-domains, classifies Branche → GewerkGroup,",
    "deduplicates across batches, and snapshots core.db for downstream pipelines.",
  ].join(" ");

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

export const createGogols = (): CatalogHarvestPipelineStep[] => createPipeline().steps;
