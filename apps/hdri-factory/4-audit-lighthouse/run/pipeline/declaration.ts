/*
<MODULE_CONTRACT>
<purpose>Declaration loaders and re-exports for the Lighthouse audit pipeline route.</purpose>
<keywords>declaration, pipeline, phase, gogol, loader</keywords>
<responsibilities>
  <item>Configure and expose pipeline declaration loaders for markdown-defined route files.</item>
  <item>Re-export shared declaration types (PipelineDeclaration, PhaseDeclaration, GogolDeclaration).</item>
  <item>Re-export guide seed converters and declaration config string helpers.</item>
  <item>Define the declaration language constant (en).</item>
</responsibilities>
<non-goals>
  <item>Does not define the actual pipeline route or member order.</item>
  <item>Does not contain any gogol or phase implementations.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PIPELINE_DECLARATION_LANGUAGE">Default language for pipeline declaration files.</entry>
  <entry key="DeclarationMemberReference">Re-exported member reference type.</entry>
  <entry key="PipelineDeclaration">Re-exported pipeline route declaration type.</entry>
  <entry key="PhaseDeclaration">Re-exported phase declaration type.</entry>
  <entry key="GogolDeclaration">Re-exported gogol step declaration type.</entry>
  <entry key="loadPipelineDeclaration">Loads the top-level pipeline route declaration.</entry>
  <entry key="loadPhaseDeclaration">Loads a phase declaration by id.</entry>
  <entry key="loadGogolDeclaration">Loads a gogol step declaration by id.</entry>
  <entry key="resolveEnabledMemberIds">Resolves enabled member ids from declaration members.</entry>
  <entry key="toPhaseGuideSeed">Converts a phase declaration to a guide seed object.</entry>
  <entry key="toGogolGuideSeed">Converts a gogol declaration to a guide seed object.</entry>
  <entry key="readConfigString">Reads a required string config value from declaration.</entry>
  <entry key="readOptionalConfigString">Reads an optional string config value from declaration.</entry>
  <entry key="readConfigStringArray">Reads a required string array config value from declaration.</entry>
  <entry key="readOptionalConfigStringArray">Reads an optional string array config value from declaration.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPipelineDeclarationLoaders,
  readDeclarationConfigString,
  readDeclarationConfigStringArray,
  readOptionalDeclarationConfigString,
  readOptionalDeclarationConfigStringArray,
  toPipelinePhaseGuideSeed,
  toPipelineStepGuideSeed,
  type DeclarationMemberReference,
  type PipelinePhaseDeclaration as SharedPhaseDeclaration,
  type PipelineRouteDeclaration as SharedPipelineDeclaration,
  type PipelineStepDeclaration as SharedGogolDeclaration,
} from '@org/pipeline-node/declarations';

export const PIPELINE_DECLARATION_LANGUAGE = 'en';
export type { DeclarationMemberReference };
export type PipelineDeclaration = SharedPipelineDeclaration;
export type PhaseDeclaration = SharedPhaseDeclaration;
export type GogolDeclaration = SharedGogolDeclaration;

const declarationRootDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'pipeline-definition',
);

const declarationLoaders = createPipelineDeclarationLoaders({
  declarationRootDir,
  defaultLanguage: PIPELINE_DECLARATION_LANGUAGE,
  configMode: 'nested',
});

export const loadPipelineDeclaration = declarationLoaders.loadPipelineDeclaration;
export const loadPhaseDeclaration = declarationLoaders.loadPhaseDeclaration;
export const loadGogolDeclaration = declarationLoaders.loadStepDeclaration;
export const resolveEnabledMemberIds = (opts: { members: DeclarationMemberReference[] }) =>
  declarationLoaders.resolveEnabledMemberIds(opts);

export const toPhaseGuideSeed = toPipelinePhaseGuideSeed;
export const toGogolGuideSeed = toPipelineStepGuideSeed;
export const readConfigString = readDeclarationConfigString;
export const readOptionalConfigString = readOptionalDeclarationConfigString;
export const readConfigStringArray = readDeclarationConfigStringArray;
export const readOptionalConfigStringArray = readOptionalDeclarationConfigStringArray;

