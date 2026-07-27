/*
<MODULE_CONTRACT>
<purpose>Abstract base for contract-ontology pipeline phases — this module handles app phase operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement step-specific logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import { createDeclaredPhaseOptions } from "@syrokomskyi/pipeline-node/declarations";
import { loadPhaseDeclaration, resolveEnabledMemberIds } from "../declaration.js";
import type {
  ContractOntologyPipelineStep,
  PipelineBuildContext,
  PipelineMember,
  PipelineMemberFactory,
} from "../build-types.js";

type AppPhaseOptions = {
  id: string;
  buildContext: PipelineBuildContext;
  createMember: PipelineMemberFactory;
};

export abstract class AppPhase extends PipelinePhase<ContractOntologyPipelineStep> {
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
