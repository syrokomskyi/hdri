/*
<MODULE_CONTRACT>
<purpose>Maps gogol factory names to concrete gogol instances for the observatory pipeline.</purpose>
<keywords>factory, gogol, registry</keywords>
<responsibilities>
  <item>Creates gogol instances by factory id from declarations.</item>
  <item>Applies guide metadata from declaration to each gogol.</item>
</responsibilities>
<non-goals>
  <item>Do not implement gogol business logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createGogolById">Factory function dispatching by gogol id.</entry>
  <entry key="simpleFactories">Map of factory name to gogol constructor.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory — empty registry, ready for gogols.</item>
  <item>Register SetupObservatoryRunGogol, SyncFromFactoryGogol, ScoreHdriGogol, BuildCohortsGogol, ExportMartGogol.</item>
  <item>Register SignObservationsGogol, MintAssetIdsGogol, WriteVaultGogol.</item>
  <item>P0.4: remove IngestAssetStatesGogol (replaced by SyncFromFactoryGogol bundle path).</item>
  <item>Clean: remove deprecated TranslateProfileObservationsGogol and associated test.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineBuildContext } from './build-types';
import { loadGogolDeclaration, toGogolGuideSeed } from './declaration';
import type { Gogol } from './Gogol';

import { SetupObservatoryRunGogol } from '../gogols/SetupObservatoryRunGogol';
import { SyncFromFactoryGogol } from '../gogols/SyncFromFactoryGogol';
import { SignObservationsGogol } from '../gogols/SignObservationsGogol';
import { MintAssetIdsGogol } from '../gogols/MintAssetIdsGogol';
import { WriteVaultGogol } from '../gogols/WriteVaultGogol';
import { ScoreHdriGogol } from '../gogols/ScoreHdriGogol';
import { BuildCohortsGogol } from '../gogols/BuildCohortsGogol';
import { ExportMartGogol } from '../gogols/ExportMartGogol';

const simpleFactories: Record<string, () => Gogol> = {
  'setup-observatory-run': () => new SetupObservatoryRunGogol(),
  'sync-from-factory': () => new SyncFromFactoryGogol(),
  'sign-observations': () => new SignObservationsGogol(),
  'mint-asset-ids': () => new MintAssetIdsGogol(),
  'write-vault': () => new WriteVaultGogol(),
  'score-hdri': () => new ScoreHdriGogol(),
  'build-cohorts': () => new BuildCohortsGogol(),
  'export-mart': () => new ExportMartGogol(),
};

export const createGogolById = (
  id: string,
  _buildContext: PipelineBuildContext,
): Gogol => {
  const declaration = loadGogolDeclaration({
    id,
    language: _buildContext.declarationLanguage,
  });

  const factoryName = declaration.factory ?? id;
  const factory = simpleFactories[factoryName];
  if (!factory) {
    throw new Error(
      `Unknown gogol factory "${factoryName}" for id "${id}". ` +
      `Register it in gogol-registry.ts simpleFactories.`,
    );
  }

  const gogol = factory();
  return gogol.withExplanation(toGogolGuideSeed(declaration)) as Gogol;
};
