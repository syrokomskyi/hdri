/*
<MODULE_CONTRACT>
<purpose>Provides an abstract base phase class for the 3-extract-profile pipeline that uses declaration-driven options to assemble phase members.</purpose>
<keywords>app phase, abstract base, declaration-driven, phase assembly</keywords>
<responsibilities>
  <item>Define the AppPhase abstract class that extends PipelinePhase with declaration-based member resolution.</item>
</responsibilities>
<non-goals>
  <item>Not responsible for concrete phase instantiation or gogol factory logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AppPhase">Abstract base class that constructs a PipelinePhase from a declaration by loading phase metadata and resolving enabled member ids via createDeclaredPhaseOptions.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import { PipelinePhase } from '@org/pipeline-core/phase';
import { createDeclaredPhaseOptions } from '@org/pipeline-node/declarations';
import { loadPhaseDeclaration, resolveEnabledMemberIds } from '../declaration.js';
import type {
  SiteProfilePipelineStep, PipelineBuildContext,
  PipelineMember, PipelineMemberFactory,
} from '../build-types.js';

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

