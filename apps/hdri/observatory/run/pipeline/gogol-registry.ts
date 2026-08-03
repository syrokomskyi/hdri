/*
<MODULE_CONTRACT>
<purpose>Maps gogol factory names to concrete gogol instances for the observatory pipeline.</purpose>
<non-goals>
  <item>Do not implement gogol business logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled registry with shared createGogolRegistry from @syrokomskyi/pipeline-node/declarations.</item>
</CHANGE_SUMMARY>
*/

import { createGogolRegistry } from "@syrokomskyi/pipeline-node/declarations";

import { loadGogolDeclaration, toGogolGuideSeed } from "./declaration";
import type { Gogol } from "./Gogol";

import { SetupObservatoryRunGogol } from "../gogols/SetupObservatoryRunGogol";
import { SyncFromFactoryGogol } from "../gogols/SyncFromFactoryGogol";
import { SignObservationsGogol } from "../gogols/SignObservationsGogol";
import { MintAssetIdsGogol } from "../gogols/MintAssetIdsGogol";
import { WriteVaultGogol } from "../gogols/WriteVaultGogol";
import { ScoreHdriGogol } from "../gogols/ScoreHdriGogol";
import { BuildCohortsGogol } from "../gogols/BuildCohortsGogol";
import { ExportMartGogol } from "../gogols/ExportMartGogol";
import { PrepareQuarterReleaseGogol } from "../gogols/PrepareQuarterReleaseGogol";
import { SealCapsuleGogol } from "../gogols/SealCapsuleGogol";
import { ValidateQuarterGogol } from "../gogols/ValidateQuarterGogol";
import { ReleaseQuarterGogol } from "../gogols/ReleaseQuarterGogol";

export const createGogolById = createGogolRegistry<Gogol>({
  loadGogolDeclaration,
  toGogolGuideSeed,
  factories: {
    "setup-observatory-run": () => new SetupObservatoryRunGogol(),
    "sync-from-factory": () => new SyncFromFactoryGogol(),
    "sign-observations": () => new SignObservationsGogol(),
    "mint-asset-ids": () => new MintAssetIdsGogol(),
    "write-vault": () => new WriteVaultGogol(),
    "score-hdri": () => new ScoreHdriGogol(),
    "build-cohorts": () => new BuildCohortsGogol(),
    "export-mart": () => new ExportMartGogol(),
    "prepare-quarter-release": () => new PrepareQuarterReleaseGogol(),
    "seal-capsule": () => new SealCapsuleGogol(),
    "validate-quarter": () => new ValidateQuarterGogol(),
    "release-quarter": () => new ReleaseQuarterGogol(),
  },
});
