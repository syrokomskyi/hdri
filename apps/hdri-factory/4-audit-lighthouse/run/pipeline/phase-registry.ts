/*
<MODULE_CONTRACT>
<purpose>Phase registry that maps phase IDs to AppPhase instances for the Lighthouse audit pipeline.</purpose>
<keywords>phase, registry, pipeline, app-phase</keywords>
<responsibilities>
  <item>Define the PhaseId union type (setup, audit).</item>
  <item>Map phase IDs to their AppPhase constructors with build context.</item>
  <item>Provide isPhaseId type guard and createPhaseById factory.</item>
  <item>Bridge gogol creation via the central gogol-registry.</item>
</responsibilities>
<non-goals>
  <item>Does not define gogol implementations or declaration loading.</item>
  <item>Does not contain pipeline orchestration logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PhaseId">Union type of valid phase identifiers.</entry>
  <entry key="SiteDeepAuditPhase">Concrete AppPhase subclass instantiated per phase id.</entry>
  <entry key="isPhaseId">Type guard that checks if a string is a valid PhaseId.</entry>
  <entry key="createPhaseById">Factory that creates a Phase for a given PhaseId and build context.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { SiteDeepAuditPipelineStep, PipelineBuildContext, PipelineMember } from './build-types.js';
import { createGogolById } from './gogol-registry.js';
import { AppPhase } from './phases/AppPhase.js';

export type PhaseId = 'setup' | 'audit';

const createMember = (id: string, ctx: PipelineBuildContext): PipelineMember =>
  isPhaseId(id) ? createPhaseById(id, ctx) : createGogolById(id, ctx);

class SiteDeepAuditPhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({ id, buildContext, createMember: (memberId) => createMember(memberId, buildContext) });
  }
}

const phaseFactories = {
  'setup': (ctx: PipelineBuildContext) => new SiteDeepAuditPhase('setup', ctx),
  'audit': (ctx: PipelineBuildContext) => new SiteDeepAuditPhase('audit', ctx),
} satisfies Record<string, (ctx: PipelineBuildContext) => PipelinePhase<SiteDeepAuditPipelineStep>>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  ctx: PipelineBuildContext,
): PipelinePhase<SiteDeepAuditPipelineStep> => phaseFactories[id](ctx);

