/*
<MODULE_CONTRACT>
<purpose>Abstract base phase for the Lighthouse audit pipeline that wires declaration-driven phase options.</purpose>
<keywords>phase, abstract, base, pipeline, declaration</keywords>
<responsibilities>
  <item>Provide a common AppPhase base class for all phases in the audit pipeline.</item>
  <item>Load phase declarations and resolve enabled member ids via shared declaration helpers.</item>
  <item>Wire id, members, and explain metadata into the parent PipelinePhase constructor.</item>
</responsibilities>
<non-goals>
  <item>Does not define any concrete phase logic or member ordering.</item>
  <item>Does not contain gogol implementations or pipeline orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AppPhase">Abstract base class for pipeline phases in the audit Lighthouse app.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import { PipelinePhase } from '@org/pipeline-core/phase';
import { createDeclaredPhaseOptions } from '@org/pipeline-node/declarations';
import { loadPhaseDeclaration, resolveEnabledMemberIds } from '../declaration.js';
import type {
  SiteDeepAuditPipelineStep, PipelineBuildContext,
  PipelineMember, PipelineMemberFactory,
} from '../build-types.js';

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

