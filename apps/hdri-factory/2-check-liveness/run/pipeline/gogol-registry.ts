/*
<MODULE_CONTRACT>
<purpose>Maps gogol IDs to their concrete factory constructors and wires declaration-based guide seeds onto each step.</purpose>
<keywords>gogol, registry, factory, guide, declaration</keywords>
<responsibilities>
  <item>Maintains a simple factory map from gogol ID to constructor.</item>
  <item>Provides a createGogolById function that loads the declaration, resolves the factory, and attaches a guide seed.</item>
</responsibilities>
<non-goals>
  <item>Does not define gogol classes themselves.</item>
  <item>Does not handle phase creation or member resolution.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createGogolById">Creates a gogol step by ID, loading its declaration and attaching a guide seed.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import { SetupLivenessDbGogol } from '../gogols/SetupLivenessDbGogol.js';
import { CheckLivenessGogol } from '../gogols/CheckLivenessGogol.js';
import { SummarizeLivenessGogol } from '../gogols/SummarizeLivenessGogol.js';
import { LivenessByBundeslandGogol } from '../gogols/LivenessByBundeslandGogol.js';
import { VerifyUpstreamGogol } from '../gogols/VerifyUpstreamGogol.js';
import { SignSourceGogol } from '../gogols/SignSourceGogol.js';
import {
  loadGogolDeclaration,
  toGogolGuideSeed,
} from './declaration.js';
import type { SiteLivenessPipelineStep, PipelineBuildContext } from './build-types.js';

const simpleFactories: Record<string, () => SiteLivenessPipelineStep> = {
  'setup-liveness-db': () => new SetupLivenessDbGogol(),
  'check-liveness': () => new CheckLivenessGogol(),
  'liveness-by-bundesland': () => new LivenessByBundeslandGogol(),
  'summarize-liveness': () => new SummarizeLivenessGogol(),
  'verify-upstream': () => new VerifyUpstreamGogol(),
  'sign-source': () => new SignSourceGogol(),
};

export const createGogolById = (
  id: string,
  context: PipelineBuildContext,
): SiteLivenessPipelineStep => {
  const declaration = loadGogolDeclaration({
    id,
    language: context.declarationLanguage,
  });
  const withGuide = <TStep extends SiteLivenessPipelineStep>(step: TStep): TStep =>
    step.withExplanation(toGogolGuideSeed(declaration));

  const factory = simpleFactories[declaration.factory];
  if (!factory) {
    throw new Error(`Unknown gogol factory: ${declaration.factory} (gogol id: ${id})`);
  }

  return withGuide(factory());
};

