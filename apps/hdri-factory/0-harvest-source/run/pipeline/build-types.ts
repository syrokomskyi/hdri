/*
<MODULE_CONTRACT>
<purpose>Defines types for the catalog harvest pipeline, facilitating the construction and management of pipeline steps and phases.</purpose>
<keywords>pipeline, types, catalog harvest</keywords>
<responsibilities>
  <item>Defines the structure for pipeline build context.</item>
  <item>Specifies types for catalog harvest pipeline steps and phases.</item>
  <item>Provides a factory type for creating pipeline members.</item>
</responsibilities>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
  <item>Do not handle data processing or transformation.</item>
  <item>Do not manage external dependencies or configurations.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineBuildContext">Defines the context for pipeline builds.</entry>
  <entry key="CatalogHarvestPipelineStep">Represents a step in the catalog harvest pipeline.</entry>
  <entry key="PipelineMemberFactory">Factory type for creating pipeline members.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill type definitions for the catalog harvest pipeline to enhance type safety and clarity.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { PipelineStep } from '@org/pipeline-core/step';
import type { PipelineContext } from './types.js';

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type CatalogHarvestPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember =
  | CatalogHarvestPipelineStep
  | PipelinePhase<CatalogHarvestPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;

