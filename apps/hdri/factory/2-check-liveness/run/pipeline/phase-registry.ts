/*
<MODULE_CONTRACT>
<purpose>Creates pipeline phases (setup, check) with their resolved member gogols for the check-liveness app.</purpose>
<non-goals>
  <item>Does not define gogol factories or declarations.</item>
  <item>Does not define the abstract AppPhase base class.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type {
  SiteLivenessPipelineStep,
  PipelineBuildContext,
  PipelineMember,
} from "./build-types.js";
import { createGogolById } from "./gogol-registry.js";
import { AppPhase } from "./phases/AppPhase.js";

export type PhaseId = "setup" | "check";

const createPipelineMemberById = (id: string, context: PipelineBuildContext): PipelineMember =>
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
  setup: (buildContext: PipelineBuildContext) => new SiteLivenessPhase("setup", buildContext),
  check: (buildContext: PipelineBuildContext) => new SiteLivenessPhase("check", buildContext),
} satisfies Record<
  string,
  (buildContext: PipelineBuildContext) => PipelinePhase<SiteLivenessPipelineStep>
>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  buildContext: PipelineBuildContext,
): PipelinePhase<SiteLivenessPipelineStep> => phaseFactories[id](buildContext);
