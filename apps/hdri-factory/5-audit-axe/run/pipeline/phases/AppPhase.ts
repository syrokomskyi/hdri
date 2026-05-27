/*
<MODULE_CONTRACT>
<purpose>Abstract base phase class for the axe audit pipeline, wiring declaration-driven phase options.</purpose>
<keywords>phase, abstract, base, declaration, pipeline</keywords>
<responsibilities>
  <item>Provide a common base class for all axe audit pipeline phases.</item>
  <item>Resolve phase member IDs from the declaration using createDeclaredPhaseOptions.</item>
  <item>Bridge the build context declaration language into phase option creation.</item>
</responsibilities>
<non-goals>
  <item>Does not define concrete phase implementations or gogol factories.</item>
  <item>Does not contain any pipeline orchestration or runtime logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AppPhase">Abstract base class extending PipelinePhase with declaration-driven options.</entry>
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

