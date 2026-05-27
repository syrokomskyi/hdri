/*
<MODULE_CONTRACT>
<purpose>Phase registry that maps phase IDs to phase instances for the axe audit pipeline.</purpose>
<keywords>phase, registry, factory, pipeline, audit</keywords>
<responsibilities>
  <item>Define the supported phase IDs for the axe audit pipeline.</item>
  <item>Provide a factory function to create phase instances by ID.</item>
  <item>Provide an isPhaseId type guard to check if a string is a valid phase ID.</item>
  <item>Delegate individual gogol creation to the gogol registry for non-phase members.</item>
</responsibilities>
<non-goals>
  <item>Does not define gogol implementations or pipeline orchestration logic.</item>
  <item>Does not handle declaration loading or guide generation.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PhaseId">Union type of valid phase identifiers (setup | audit).</entry>
  <entry key="SiteDeepAuditPhase">Concrete phase class extending AppPhase for axe audit phases.</entry>
  <entry key="phaseFactories">Record mapping phase IDs to their factory functions.</entry>
  <entry key="isPhaseId">Type guard that checks whether a string is a valid PhaseId.</entry>
  <entry key="createPhaseById">Factory function that creates a phase instance for the given PhaseId.</entry>
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

