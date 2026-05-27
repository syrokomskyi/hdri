/*
<MODULE_CONTRACT>
<purpose>Sets up declaration loading for the 3-extract-profile pipeline, wrapping shared pipeline-node helpers and re-exporting types.</purpose>
<keywords>declaration, pipeline, phase, gogol, loading</keywords>
<responsibilities>
  <item>Create and export declaration loaders for pipeline, phase, and gogol declarations.</item>
  <item>Re-export shared declaration types and helper functions for config reading and guide seeding.</item>
</responsibilities>
<non-goals>
  <item>Not responsible for pipeline execution or member instantiation.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PIPELINE_DECLARATION_LANGUAGE">Default declaration language (en).</entry>
  <entry key="PipelineDeclaration">Re-exported shared pipeline declaration type.</entry>
  <entry key="PhaseDeclaration">Re-exported shared phase declaration type.</entry>
  <entry key="GogolDeclaration">Re-exported shared gogol declaration type.</entry>
  <entry key="DeclarationMemberReference">Re-exported member reference type.</entry>
  <entry key="loadPipelineDeclaration">Loads the top-level pipeline declaration.</entry>
  <entry key="loadPhaseDeclaration">Loads a phase declaration by id.</entry>
  <entry key="loadGogolDeclaration">Loads a gogol declaration by id.</entry>
  <entry key="resolveEnabledMemberIds">Resolves enabled member ids from declaration references.</entry>
  <entry key="toPhaseGuideSeed">Converts a phase declaration to a guide seed object.</entry>
  <entry key="toGogolGuideSeed">Converts a gogol declaration to a guide seed object.</entry>
  <entry key="readConfigString">Reads a required string config value from a declaration.</entry>
  <entry key="readOptionalConfigString">Reads an optional string config value from a declaration.</entry>
  <entry key="readConfigStringArray">Reads a required string array config value from a declaration.</entry>
  <entry key="readOptionalConfigStringArray">Reads an optional string array config value from a declaration.</entry>
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

