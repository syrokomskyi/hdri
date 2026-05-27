/*
<MODULE_CONTRACT>
<purpose>Facilitates the creation of specific Gogol instances based on identifiers for the register-businesses pipeline.</purpose>
<keywords>factory, pipeline, registration, gogol</keywords>
<responsibilities>
  <item>Maps string identifiers to corresponding Gogol factory classes for instantiation.</item>
  <item>Loads declarations for Gogol instances based on provided IDs and context.</item>
  <item>Enhances Gogol instances with contextual explanations derived from declarations.</item>
</responsibilities>
<non-goals>
  <item>Do not handle the orchestration of pipeline execution or management.</item>
  <item>Do not parse raw content or perform data validation outside of Gogol declarations.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="simpleFactories">Factory mapping for Gogol instances.</entry>
  <entry key="createGogolById">Function to create a Gogol instance by ID.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation for declaration-driven pipeline.</item>
</CHANGE_SUMMARY>
*/

import { VerifyUpstreamGogol } from '../gogols/VerifyUpstreamGogol.js';
import { DiscoverCoresGogol } from '../gogols/DiscoverCoresGogol.js';
import { MergeRegistryGogol } from '../gogols/MergeRegistryGogol.js';
import { MintAssetIdsGogol } from '../gogols/MintAssetIdsGogol.js';
import { SignSourceGogol } from '../gogols/SignSourceGogol.js';
import {
  loadGogolDeclaration,
  toGogolGuideSeed,
} from './declaration.js';
import type { RegisterBusinessesPipelineStep, PipelineBuildContext } from './build-types.js';

const simpleFactories: Record<string, () => RegisterBusinessesPipelineStep> = {
  'verify-upstream': () => new VerifyUpstreamGogol(),
  'discover-cores': () => new DiscoverCoresGogol(),
  'merge-registry': () => new MergeRegistryGogol(),
  'mint-asset-ids': () => new MintAssetIdsGogol(),
  'sign-source': () => new SignSourceGogol(),
};

export const createGogolById = (
  id: string,
  context: PipelineBuildContext,
): RegisterBusinessesPipelineStep => {
  const declaration = loadGogolDeclaration({
    id,
    language: context.declarationLanguage,
  });
  const withGuide = <TStep extends RegisterBusinessesPipelineStep>(step: TStep): TStep =>
    step.withExplanation(toGogolGuideSeed(declaration));

  const factory = simpleFactories[declaration.factory];
  if (!factory) {
    throw new Error(`Unknown gogol factory: ${declaration.factory} (gogol id: ${id})`);
  }

  return withGuide(factory());
};
