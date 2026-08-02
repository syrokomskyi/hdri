/*
<MODULE_CONTRACT>
<purpose>Defines types for building the observatory pipeline — this module handles build-types operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for observatory.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type { PipelineStep } from "@syrokomskyi/pipeline-core/step";
import type { PipelineContext } from "./types";

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type ObservatoryPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember = ObservatoryPipelineStep | PipelinePhase<ObservatoryPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
