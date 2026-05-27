/*
<MODULE_CONTRACT>
<purpose>Creates pipeline phases (setup, check) with their resolved member gogols for the check-liveness app.</purpose>
<keywords>phase, registry, pipeline, member, gogol</keywords>
<responsibilities>
  <item>Defines the PhaseId union type for the check-liveness pipeline.</item>
  <item>Resolves pipeline member IDs to either nested phases or gogol steps.</item>
  <item>Provides factory functions for each phase ID.</item>
  <item>Exports helpers to check phase IDs and create phases by ID.</item>
</responsibilities>
<non-goals>
  <item>Does not define gogol factories or declarations.</item>
  <item>Does not define the abstract AppPhase base class.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PhaseId">Union type of valid phase identifiers.</entry>
  <entry key="createPhaseById">Creates a phase by its ID using the phase factory map.</entry>
  <entry key="isPhaseId">Type guard that checks whether a string is a valid phase ID.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import type { PipelinePhase } from '@org/pipeline-core/phase';
import type {
  SiteLivenessPipelineStep,
  PipelineBuildContext,
  PipelineMember,
} from './build-types.js';
import { createGogolById } from './gogol-registry.js';
import { AppPhase } from './phases/AppPhase.js';

export type PhaseId = 'setup' | 'check';

const createPipelineMemberById = (
  id: string,
  context: PipelineBuildContext,
): PipelineMember =>
  isPhaseId(id) ? createPhaseById(id, context) : createGogolById(id, context);

class SiteLivenessPhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({
      id,
      buildContext,
      createMember: (memberId) => createPipelineMemberById(memberId, buildContext),
    });
  }
}

const phaseFactories = {
  'setup': (buildContext: PipelineBuildContext) =>
    new SiteLivenessPhase('setup', buildContext),
  'check': (buildContext: PipelineBuildContext) =>
    new SiteLivenessPhase('check', buildContext),
} satisfies Record<string, (buildContext: PipelineBuildContext) => PipelinePhase<SiteLivenessPipelineStep>>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  buildContext: PipelineBuildContext,
): PipelinePhase<SiteLivenessPipelineStep> => phaseFactories[id](buildContext);

