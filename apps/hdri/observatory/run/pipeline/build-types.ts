/*
<MODULE_CONTRACT>
<purpose>Defines types for building the observatory pipeline — this module handles build-types operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.summary.trim; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "@warpgogol/pipeline-core/phase";
import type { PipelineStep } from "@warpgogol/pipeline-core/step";
import type { PipelineContext } from "./types";

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type ObservatoryPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember = ObservatoryPipelineStep | PipelinePhase<ObservatoryPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
