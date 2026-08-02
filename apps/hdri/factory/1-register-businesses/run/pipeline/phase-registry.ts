/*
<MODULE_CONTRACT>
<purpose>Facilitates the creation and management of pipeline phases for the register-businesses pipeline.</purpose>
<non-goals>
  <item>Do not handle data parsing or transformation logic for pipeline steps.</item>
  <item>Do not manage the orchestration of pipeline execution or configuration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation for declaration-driven pipeline.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type {
  RegisterBusinessesPipelineStep,
  PipelineBuildContext,
  PipelineMember,
} from "./build-types.js";
import { createGogolById } from "./gogol-registry.js";
import { AppPhase } from "./phases/AppPhase.js";

export type PhaseId = "register-businesses";

const createPipelineMemberById = (id: string, context: PipelineBuildContext): PipelineMember =>
  isPhaseId(id) ? createPhaseById(id, context) : createGogolById(id, context);

class RegisterBusinessesPhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({
      id,
      buildContext,
      createMember: (memberId) => createPipelineMemberById(memberId, buildContext),
    });
  }
}

const phaseFactories = {
  "register-businesses": (buildContext: PipelineBuildContext) =>
    new RegisterBusinessesPhase("register-businesses", buildContext),
} satisfies Record<
  string,
  (buildContext: PipelineBuildContext) => PipelinePhase<RegisterBusinessesPipelineStep>
>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  buildContext: PipelineBuildContext,
): PipelinePhase<RegisterBusinessesPipelineStep> => phaseFactories[id](buildContext);
