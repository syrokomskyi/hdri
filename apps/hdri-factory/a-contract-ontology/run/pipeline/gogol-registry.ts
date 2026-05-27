/*
<MODULE_CONTRACT>
<purpose>Maps gogol factory names to concrete gogol instances for the contract-ontology pipeline.</purpose>
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
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import { loadGogolDeclaration, toGogolGuideSeed } from './declaration.js';
import type { ContractOntologyPipelineStep, PipelineBuildContext } from './build-types.js';
import type { Gogol } from './Gogol.js';

import { DiscoverSourcesGogol } from '../gogols/DiscoverSourcesGogol.js';
import { TranslateOntologyGogol } from '../gogols/TranslateOntologyGogol.js';
import { ResolveConflictsGogol } from '../gogols/ResolveConflictsGogol.js';
import { SignBundleGogol } from '../gogols/SignBundleGogol.js';
import { EmitBundleGogol } from '../gogols/EmitBundleGogol.js';

const simpleFactories: Record<string, () => Gogol> = {
  'discover-sources': () => new DiscoverSourcesGogol(),
  'translate-ontology': () => new TranslateOntologyGogol(),
  'resolve-conflicts': () => new ResolveConflictsGogol(),
  'sign-bundle': () => new SignBundleGogol(),
  'emit-bundle': () => new EmitBundleGogol(),
};

export const createGogolById = (
  id: string,
  buildContext: PipelineBuildContext,
): ContractOntologyPipelineStep => {
  const declaration = loadGogolDeclaration({
    id,
    language: buildContext.declarationLanguage,
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
  return gogol.withExplanation(toGogolGuideSeed(declaration)) as ContractOntologyPipelineStep;
};
