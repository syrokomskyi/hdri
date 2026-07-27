/*
<MODULE_CONTRACT>
<purpose>Provides an abstract base phase class for the 3-extract-profile pipeline that uses declaration-driven options to assemble phase members.</purpose>
<non-goals>
  <item>Not responsible for concrete phase instantiation or gogol factory logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import { createDeclaredPhaseOptions } from "@syrokomskyi/pipeline-node/declarations";
import { loadPhaseDeclaration, resolveEnabledMemberIds } from "../declaration.js";
import type {
  SiteProfilePipelineStep,
  PipelineBuildContext,
  PipelineMember,
  PipelineMemberFactory,
} from "../build-types.js";

export abstract class AppPhase extends PipelinePhase<SiteProfilePipelineStep> {
  constructor(options: {
    id: string;
    buildContext: PipelineBuildContext;
    createMember: PipelineMemberFactory;
  }) {
    const phaseOptions = createDeclaredPhaseOptions<PipelineMember>({
      id: options.id,
      language: options.buildContext.declarationLanguage,
      loadPhaseDeclaration,
      resolveEnabledMemberIds,
      createMember: options.createMember,
    });
    super({ id: phaseOptions.id, members: phaseOptions.members, explain: phaseOptions.explain });
  }
}
