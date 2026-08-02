/*
<MODULE_CONTRACT>
<purpose>Facilitates the creation of specific Gogol instances based on identifiers within a catalog harvest pipeline.</purpose>
<non-goals>
  <item>Do not handle the orchestration of pipeline execution or management.</item>
  <item>Do not parse raw content or perform data validation outside of Gogol declarations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill COMPASS scaffolding to enhance navigability and maintainability of the Gogol registry logic.</item>
  <item>Register EnrichBundeslandGogol factory for the enrich-bundesland gogol.</item>
  <item>Register SignSourceGogol factory for the sign-source gogol.</item>
</CHANGE_SUMMARY>
*/

import { SetupCoreDbGogol } from "../gogols/SetupCoreDbGogol.js";
import { ParseSourcesGogol } from "../gogols/ParseSourcesGogol.js";
import { ClassifyBrancheGogol } from "../gogols/ClassifyBrancheGogol.js";
import { EnrichBundeslandGogol } from "../gogols/EnrichBundeslandGogol.js";
import { DeduplicateSitesGogol } from "../gogols/DeduplicateSitesGogol.js";
import { SnapshotHarvestGogol } from "../gogols/SnapshotHarvestGogol.js";
import { SignSourceGogol } from "../gogols/SignSourceGogol.js";
import { loadGogolDeclaration, toGogolGuideSeed } from "./declaration.js";
import type { CatalogHarvestPipelineStep, PipelineBuildContext } from "./build-types.js";

const simpleFactories: Record<string, () => CatalogHarvestPipelineStep> = {
  "setup-core-db": () => new SetupCoreDbGogol(),
  "parse-sources": () => new ParseSourcesGogol(),
  "classify-branche": () => new ClassifyBrancheGogol(),
  "enrich-bundesland": () => new EnrichBundeslandGogol(),
  "deduplicate-sites": () => new DeduplicateSitesGogol(),
  "snapshot-harvest": () => new SnapshotHarvestGogol(),
  "sign-source": () => new SignSourceGogol(),
};

export const createGogolById = (
  id: string,
  context: PipelineBuildContext,
): CatalogHarvestPipelineStep => {
  const declaration = loadGogolDeclaration({
    id,
    language: context.declarationLanguage,
  });
  const withGuide = <TStep extends CatalogHarvestPipelineStep>(step: TStep): TStep =>
    step.withExplanation(toGogolGuideSeed(declaration));

  const factory = simpleFactories[declaration.factory];
  if (!factory) {
    throw new Error(`Unknown gogol factory: ${declaration.factory} (gogol id: ${id})`);
  }

  return withGuide(factory());
};
