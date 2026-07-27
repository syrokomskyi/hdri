/*
<MODULE_CONTRACT>
<purpose>Defines phase IDs and creates phase instances for the 3-extract-profile pipeline by delegating to AppPhase and gogol-registry.</purpose>
<non-goals>
  <item>Not responsible for gogol-level factory logic or pipeline-level assembly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type {
  SiteProfilePipelineStep,
  PipelineBuildContext,
  PipelineMember,
} from "./build-types.js";
import { createGogolById } from "./gogol-registry.js";
import { AppPhase } from "./phases/AppPhase.js";

export type PhaseId = "setup" | "crawl" | "extract" | "fetch-detected" | "summarize" | "emit";

const createMember = (id: string, ctx: PipelineBuildContext): PipelineMember =>
  isPhaseId(id) ? createPhaseById(id, ctx) : createGogolById(id, ctx);

class SiteProfilePhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({ id, buildContext, createMember: (memberId) => createMember(memberId, buildContext) });
  }
}

const phaseFactories = {
  setup: (ctx: PipelineBuildContext) => new SiteProfilePhase("setup", ctx),
  crawl: (ctx: PipelineBuildContext) => new SiteProfilePhase("crawl", ctx),
  extract: (ctx: PipelineBuildContext) => new SiteProfilePhase("extract", ctx),
  "fetch-detected": (ctx: PipelineBuildContext) => new SiteProfilePhase("fetch-detected", ctx),
  summarize: (ctx: PipelineBuildContext) => new SiteProfilePhase("summarize", ctx),
  emit: (ctx: PipelineBuildContext) => new SiteProfilePhase("emit", ctx),
} satisfies Record<string, (ctx: PipelineBuildContext) => PipelinePhase<SiteProfilePipelineStep>>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  ctx: PipelineBuildContext,
): PipelinePhase<SiteProfilePipelineStep> => phaseFactories[id](ctx);
