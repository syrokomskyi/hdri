/*
<MODULE_CONTRACT>
<purpose>Registry for gogol factories — maps declaration factory IDs to class instances.</purpose>
<keywords>registry, factory, gogol, mapping</keywords>
<responsibilities>
  <item>Map factory IDs from markdown declarations to Gogol class constructors.</item>
  <item>Wire guide seed (explanation) from declaration into instantiated gogols.</item>
</responsibilities>
<non-goals>
  <item>Do not load or parse markdown declarations — that is handled by declaration.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="simpleFactories">Record mapping factory ID to zero-arg constructor.</entry>
  <entry key="createGogolById">Main entry: load declaration, resolve factory, instantiate with guide seed.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add capture-environment-profile gogol to registry for Phase 0 Setup.</item>
  <item>Add GRACE scaffolding to registry file.</item>
  <item>Remove axe gogols from registry - this app is Lighthouse-only.</item>
  <item>Phase B cleanup: remove load-audit-cohort and lighthouse-audit-by-bundesland gogols.</item>
  <item>Complete Phase B cleanup: remove load-audit-cohort and lighthouse-audit-by-bundesland declarations and phase references.</item>
</CHANGE_SUMMARY>
*/

import { CaptureEnvironmentProfileGogol } from '../gogols/CaptureEnvironmentProfileGogol.js';
import { SetupAuditDbGogol } from '../gogols/SetupAuditDbGogol.js';
import { LighthouseAuditGogol } from '../gogols/LighthouseAuditGogol.js';
import { SummarizeAuditGogol } from '../gogols/SummarizeAuditGogol.js';
import { VerifyUpstreamGogol } from '../gogols/VerifyUpstreamGogol.js';
import { SignSourceGogol } from '../gogols/SignSourceGogol.js';
import { loadGogolDeclaration, toGogolGuideSeed } from './declaration.js';
import type { SiteDeepAuditPipelineStep, PipelineBuildContext } from './build-types.js';

const simpleFactories: Record<string, () => SiteDeepAuditPipelineStep> = {
  'capture-environment-profile': () => new CaptureEnvironmentProfileGogol(),
  'setup-audit-db':       () => new SetupAuditDbGogol(),
  'lighthouse-audit':              () => new LighthouseAuditGogol(),
  'summarize-audit':               () => new SummarizeAuditGogol(),
  'verify-upstream':               () => new VerifyUpstreamGogol(),
  'sign-source':                   () => new SignSourceGogol(),
};

export const createGogolById = (
  id: string,
  context: PipelineBuildContext,
): SiteDeepAuditPipelineStep => {
  const declaration = loadGogolDeclaration({ id, language: context.declarationLanguage });
  const factory = simpleFactories[declaration.factory];
  if (!factory) throw new Error(`Unknown gogol factory: ${declaration.factory} (id: ${id})`);
  return factory().withExplanation(toGogolGuideSeed(declaration));
};


