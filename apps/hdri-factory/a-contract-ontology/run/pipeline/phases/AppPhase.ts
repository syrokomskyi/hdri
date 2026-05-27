/*
<MODULE_CONTRACT>
<purpose>Abstract base for contract-ontology pipeline phases.</purpose>
<keywords>phase, pipeline, abstraction</keywords>
<responsibilities>
  <item>Constructs phase options from declarations and member factories.</item>
  <item>Inherits from shared PipelinePhase.</item>
</responsibilities>
<non-goals>
  <item>Do not implement step-specific logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AppPhase">Abstract phase class for the contract-ontology app.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import { PipelinePhase } from '@org/pipeline-core/phase';
import { createDeclaredPhaseOptions } from '@org/pipeline-node/declarations';
import {
  loadPhaseDeclaration,
  resolveEnabledMemberIds,
} from '../declaration.js';
import type {
  ContractOntologyPipelineStep,
  PipelineBuildContext,
  PipelineMember,
  PipelineMemberFactory,
} from '../build-types.js';

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
