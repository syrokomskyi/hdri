/*
<MODULE_CONTRACT>
<purpose>Maps phase ids to phase instances for the observatory pipeline.</purpose>
<non-goals>
  <item>Do not implement step-specific logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled phase registry with shared createPhaseRegistry from @syrokomskyi/pipeline-node/declarations.</item>
</CHANGE_SUMMARY>
*/

import { createPhaseRegistry } from "@syrokomskyi/pipeline-node/declarations";

import type { PipelineBuildContext, ObservatoryPipelineStep } from "./build-types";
import { createGogolById } from "./gogol-registry";
import { AppPhase } from "./phases/AppPhase";

const { isPhaseId, createPhaseById } = createPhaseRegistry<
  PipelineBuildContext,
  ObservatoryPipelineStep,
  "harvest" | "observe" | "interpret" | "publish"
>({
  phaseIds: ["harvest", "observe", "interpret", "publish"] as const,
  createGogolById,
  createPhase: (options) => new AppPhase(options),
});

export { isPhaseId, createPhaseById };
