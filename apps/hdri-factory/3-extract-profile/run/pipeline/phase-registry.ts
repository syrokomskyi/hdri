/*
<MODULE_CONTRACT>
<purpose>Defines phase IDs and creates phase instances for the 3-extract-profile pipeline by delegating to AppPhase and gogol-registry.</purpose>
<keywords>phase registry, phase creation, pipeline phases</keywords>
<responsibilities>
  <item>List all valid phase IDs for the site-profile pipeline.</item>
  <item>Provide createPhaseById to instantiate the correct phase with nested members.</item>
  <item>Provide isPhaseId to check whether a string is a valid phase ID.</item>
</responsibilities>
<non-goals>
  <item>Not responsible for gogol-level factory logic or pipeline-level assembly.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PhaseId">Union type of all valid phase identifiers.</entry>
  <entry key="isPhaseId">Type guard that checks if a string is a valid PhaseId.</entry>
  <entry key="createPhaseById">Creates a PipelinePhase instance for the given phase id and build context.</entry>
  <entry key="SiteProfilePhase">Concrete AppPhase subclass for site-profile phases with member delegation.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import type { PipelinePhase } from '@org/pipeline-core/phase';
import type { SiteProfilePipelineStep, PipelineBuildContext, PipelineMember } from './build-types.js';
import { createGogolById } from './gogol-registry.js';
import { AppPhase } from './phases/AppPhase.js';

export type PhaseId = 'setup' | 'crawl' | 'extract' | 'fetch-detected' | 'summarize' | 'emit';

const createMember = (id: string, ctx: PipelineBuildContext): PipelineMember =>
  isPhaseId(id) ? createPhaseById(id, ctx) : createGogolById(id, ctx);

class SiteProfilePhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({ id, buildContext, createMember: (memberId) => createMember(memberId, buildContext) });
  }
}

const phaseFactories = {
  'setup':           (ctx: PipelineBuildContext) => new SiteProfilePhase('setup', ctx),
  'crawl':           (ctx: PipelineBuildContext) => new SiteProfilePhase('crawl', ctx),
  'extract':         (ctx: PipelineBuildContext) => new SiteProfilePhase('extract', ctx),
  'fetch-detected':  (ctx: PipelineBuildContext) => new SiteProfilePhase('fetch-detected', ctx),
  'summarize':       (ctx: PipelineBuildContext) => new SiteProfilePhase('summarize', ctx),
  'emit':            (ctx: PipelineBuildContext) => new SiteProfilePhase('emit', ctx),
} satisfies Record<string, (ctx: PipelineBuildContext) => PipelinePhase<SiteProfilePipelineStep>>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  ctx: PipelineBuildContext,
): PipelinePhase<SiteProfilePipelineStep> => phaseFactories[id](ctx);

