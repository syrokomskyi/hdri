/*
<MODULE_CONTRACT>
<purpose>Defines types for the lighthouse audit pipeline build context and steps.</purpose>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
  <item>Rename LighthouseAuditPipelineStep to SiteDeepAuditPipelineStep for gogol compatibility.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type { PipelineStep } from "@syrokomskyi/pipeline-core/step";
import type { PipelineContext } from "./types.js";

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type SiteDeepAuditPipelineStep = PipelineStep<PipelineContext>;

export type PipelineMember = SiteDeepAuditPipelineStep | PipelinePhase<SiteDeepAuditPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
