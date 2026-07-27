/*
<MODULE_CONTRACT>
<purpose>Defines types for the catalog harvest pipeline, facilitating the construction and management of pipeline steps and phases.</purpose>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
  <item>Do not handle data processing or transformation.</item>
  <item>Do not manage external dependencies or configurations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill type definitions for the catalog harvest pipeline to enhance type safety and clarity.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type { PipelineStep } from "@syrokomskyi/pipeline-core/step";
import type { PipelineContext } from "./types.js";

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type CatalogHarvestPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember = CatalogHarvestPipelineStep | PipelinePhase<CatalogHarvestPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
