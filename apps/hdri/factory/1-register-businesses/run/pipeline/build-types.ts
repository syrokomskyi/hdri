/*
<MODULE_CONTRACT>
<purpose>Defines types for the register-businesses pipeline build context and steps.</purpose>
<non-goals>
  <item>Do not implement pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Add PipelineBuildContext, PipelineMember, and PipelineMemberFactory for declaration-driven pipeline.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type { Gogol } from "./Gogol.js";

export type PipelineBuildContext = {
  declarationLanguage: string;
};

export type RegisterBusinessesPipelineStep = Gogol;

export type PipelineMember =
  | RegisterBusinessesPipelineStep
  | PipelinePhase<RegisterBusinessesPipelineStep>;

export type PipelineMemberFactory = (id: string) => PipelineMember;
