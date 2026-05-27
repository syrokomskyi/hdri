/*
<MODULE_CONTRACT>
<purpose>Provides an abstract base class for pipeline phases that wires declaration-driven member resolution.</purpose>
<keywords>phase, abstract, declaration, member, pipeline</keywords>
<responsibilities>
  <item>Defines the AppPhase abstract class extending PipelinePhase.</item>
  <item>Uses createDeclaredPhaseOptions to resolve phase members from declaration markdown.</item>
</responsibilities>
<non-goals>
  <item>Does not define concrete phase instances or registry logic.</item>
  <item>Does not define gogol steps or their factories.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AppPhase">Abstract base phase class that builds its members from a declaration file.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import { PipelinePhase } from '@org/pipeline-core/phase';
import { createDeclaredPhaseOptions } from '@org/pipeline-node/declarations';
import {
  loadPhaseDeclaration,
  resolveEnabledMemberIds,
} from '../declaration.js';
import type {
  SiteLivenessPipelineStep,
  PipelineBuildContext,
  PipelineMember,
  PipelineMemberFactory,
} from '../build-types.js';

type AppPhaseOptions = {
  id: string;
  buildContext: PipelineBuildContext;
  createMember: PipelineMemberFactory;
};

export abstract class AppPhase extends PipelinePhase<SiteLivenessPipelineStep> {
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

