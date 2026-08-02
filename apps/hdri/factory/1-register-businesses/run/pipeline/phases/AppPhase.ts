/*
<MODULE_CONTRACT>
<purpose>Defines an abstract phase for register-businesses within a pipeline, facilitating the integration of various pipeline members.</purpose>
<non-goals>
  <item>Do not implement specific member logic or data processing within this phase.</item>
  <item>Do not handle transport or configuration orchestration for pipeline execution.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation for declaration-driven pipeline.</item>
</CHANGE_SUMMARY>
*/

import { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import { createDeclaredPhaseOptions } from "@syrokomskyi/pipeline-node/declarations";
import { loadPhaseDeclaration, resolveEnabledMemberIds } from "../declaration.js";
import type {
  RegisterBusinessesPipelineStep,
  PipelineBuildContext,
  PipelineMember,
  PipelineMemberFactory,
} from "../build-types.js";

type AppPhaseOptions = {
  id: string;
  buildContext: PipelineBuildContext;
  createMember: PipelineMemberFactory;
};

export abstract class AppPhase extends PipelinePhase<RegisterBusinessesPipelineStep> {
  constructor(options: AppPhaseOptions) {
    const phaseOptions = createDeclaredPhaseOptions<PipelineMember>({
      id: options.id,
      language: options.buildContext.declarationLanguage,
      loadPhaseDeclaration,
      resolveEnabledMemberIds,
      createMember: options.createMember,
    });

    super({
      id: phaseOptions.id,
      members: phaseOptions.members,
      explain: phaseOptions.explain,
    });
  }
}
