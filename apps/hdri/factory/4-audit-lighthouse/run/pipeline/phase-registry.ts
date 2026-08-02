/*
<MODULE_CONTRACT>
<purpose>Phase registry that maps phase IDs to AppPhase instances for the Lighthouse audit pipeline.</purpose>
<non-goals>
  <item>Does not define gogol implementations or declaration loading.</item>
  <item>Does not contain pipeline orchestration logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type {
  SiteDeepAuditPipelineStep,
  PipelineBuildContext,
  PipelineMember,
} from "./build-types.js";
import { createGogolById } from "./gogol-registry.js";
import { AppPhase } from "./phases/AppPhase.js";

export type PhaseId = "setup" | "audit";

const createMember = (id: string, ctx: PipelineBuildContext): PipelineMember =>
  isPhaseId(id) ? createPhaseById(id, ctx) : createGogolById(id, ctx);

class SiteDeepAuditPhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({ id, buildContext, createMember: (memberId) => createMember(memberId, buildContext) });
  }
}

const phaseFactories = {
  setup: (ctx: PipelineBuildContext) => new SiteDeepAuditPhase("setup", ctx),
  audit: (ctx: PipelineBuildContext) => new SiteDeepAuditPhase("audit", ctx),
} satisfies Record<string, (ctx: PipelineBuildContext) => PipelinePhase<SiteDeepAuditPipelineStep>>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  ctx: PipelineBuildContext,
): PipelinePhase<SiteDeepAuditPipelineStep> => phaseFactories[id](ctx);
