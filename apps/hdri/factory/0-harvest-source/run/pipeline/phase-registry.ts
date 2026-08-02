/*
<MODULE_CONTRACT> 
<purpose>Facilitates the creation and management of pipeline phases specific to catalog harvesting within the pipeline architecture.</purpose> 
 
 
<non-goals> 
  <item>Do not handle data parsing or transformation logic for pipeline steps.</item> 
  <item>Do not manage the orchestration of pipeline execution or configuration.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY> 
  <item>Backfill COMPASS scaffolding to enhance navigability and maintainability of phase registry logic.</item> 
</CHANGE_SUMMARY> 
*****/

import type { PipelinePhase } from "@syrokomskyi/pipeline-core/phase";
import type {
  CatalogHarvestPipelineStep,
  PipelineBuildContext,
  PipelineMember,
} from "./build-types.js";
import { createGogolById } from "./gogol-registry.js";
import { AppPhase } from "./phases/AppPhase.js";

export type PhaseId = "db-setup" | "harvest";

const createPipelineMemberById = (id: string, context: PipelineBuildContext): PipelineMember =>
  isPhaseId(id) ? createPhaseById(id, context) : createGogolById(id, context);

class CatalogHarvestPhase extends AppPhase {
  constructor(id: PhaseId, buildContext: PipelineBuildContext) {
    super({
      id,
      buildContext,
      createMember: (memberId) => createPipelineMemberById(memberId, buildContext),
    });
  }
}

const phaseFactories = {
  "db-setup": (buildContext: PipelineBuildContext) =>
    new CatalogHarvestPhase("db-setup", buildContext),
  harvest: (buildContext: PipelineBuildContext) => new CatalogHarvestPhase("harvest", buildContext),
} satisfies Record<
  string,
  (buildContext: PipelineBuildContext) => PipelinePhase<CatalogHarvestPipelineStep>
>;

export const isPhaseId = (id: string): id is PhaseId => Object.hasOwn(phaseFactories, id);

export const createPhaseById = (
  id: PhaseId,
  buildContext: PipelineBuildContext,
): PipelinePhase<CatalogHarvestPipelineStep> => phaseFactories[id](buildContext);
