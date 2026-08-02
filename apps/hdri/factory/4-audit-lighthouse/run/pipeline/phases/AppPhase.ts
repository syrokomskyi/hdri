/*
<MODULE_CONTRACT>
<purpose>Abstract base phase for the Lighthouse audit pipeline that wires declaration-driven phase options.</purpose>
<non-goals>
  <item>Does not define any concrete phase logic or member ordering.</item>
  <item>Does not contain gogol implementations or pipeline orchestration.</item>
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
  SiteDeepAuditPipelineStep,
  PipelineBuildContext,
  PipelineMember,
  PipelineMemberFactory,
} from "../build-types.js";

export abstract class AppPhase extends PipelinePhase<SiteDeepAuditPipelineStep> {
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
