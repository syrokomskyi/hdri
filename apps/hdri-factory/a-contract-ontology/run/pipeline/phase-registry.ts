/*
<MODULE_CONTRACT>
<purpose>Maps phase ids to phase instances for the contract-ontology pipeline.</purpose>
<keywords>phase, registry, factory</keywords>
<responsibilities>
  <item>Defines known phase identifiers.</item>
  <item>Creates phase instances via AppPhase subclass.</item>
  <item>Falls back to gogol registry for non-phase members.</item>
</responsibilities>
<non-goals>
  <item>Do not implement step-specific logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="isPhaseId">Checks if an id is a known phase.</entry>
  <entry key="createPhaseById">Creates a phase instance by id.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type {
  ContractOntologyPipelineStep,
  PipelineBuildContext,
  PipelineMember,
} from './build-types.js';
import { createGogolById } from './gogol-registry.js';
import { AppPhase } from './phases/AppPhase.js';

export type PhaseId = 'translate';

const createPipelineMemberById = (
  id: string,
  context: PipelineBuildContext,
): PipelineMember => {
  return isPhaseId(id) ? createPhaseById(id, context) : createGogolById(id, context);
};

class ContractOntologyPhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({
      id,
      buildContext,
      createMember: (memberId) => createPipelineMemberById(memberId, buildContext),
    });
  }
}

const phaseFactories = {
  translate: (ctx: PipelineBuildContext) => new ContractOntologyPhase('translate', ctx),
} satisfies Record<string, (ctx: PipelineBuildContext) => PipelinePhase<ContractOntologyPipelineStep>>;

export const isPhaseId = (id: string): id is PhaseId =>
  Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  buildContext: PipelineBuildContext,
): PipelinePhase<ContractOntologyPipelineStep> =>
  phaseFactories[id](buildContext);
