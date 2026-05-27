/*
<MODULE_CONTRACT>
<purpose>Maps phase ids to phase instances for the observatory pipeline.</purpose>
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
  <item>Initial creation for digital-observatory with initial phase ids.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { PipelineBuildContext, PipelineMember, ObservatoryPipelineStep } from './build-types';
import { createGogolById } from './gogol-registry';
import { AppPhase } from './phases/AppPhase';

export type PhaseId =
  | 'harvest'
  | 'observe'
  | 'interpret'
  | 'publish';

const createPipelineMemberById = (
  id: string,
  context: PipelineBuildContext,
): PipelineMember => {
  return isPhaseId(id) ? createPhaseById(id, context) : createGogolById(id, context);
};

class ObservatoryPhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({
      id,
      buildContext,
      createMember: (memberId) => createPipelineMemberById(memberId, buildContext),
    });
  }
}

const phaseFactories = {
  harvest: (ctx: PipelineBuildContext) => new ObservatoryPhase('harvest', ctx),
  observe: (ctx: PipelineBuildContext) => new ObservatoryPhase('observe', ctx),
  interpret: (ctx: PipelineBuildContext) => new ObservatoryPhase('interpret', ctx),
  publish: (ctx: PipelineBuildContext) => new ObservatoryPhase('publish', ctx),
} satisfies Record<string, (ctx: PipelineBuildContext) => PipelinePhase<ObservatoryPipelineStep>>;

export const isPhaseId = (id: string): id is PhaseId =>
  Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  buildContext: PipelineBuildContext,
): PipelinePhase<ObservatoryPipelineStep> =>
  phaseFactories[id](buildContext);
