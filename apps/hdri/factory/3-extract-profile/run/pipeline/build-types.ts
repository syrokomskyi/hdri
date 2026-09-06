/*
<MODULE_CONTRACT>
<purpose>Defines types for the site profile pipeline build context and steps.</purpose>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "@warpgogol/pipeline-core/phase";
import type { PipelineStep } from "@warpgogol/pipeline-core/step";
import type { PipelineContext } from "./types.js";

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type SiteProfilePipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember = SiteProfilePipelineStep | PipelinePhase<SiteProfilePipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
