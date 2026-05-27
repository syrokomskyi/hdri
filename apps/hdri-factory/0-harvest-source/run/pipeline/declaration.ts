/*
<MODULE_CONTRACT>
<purpose>Facilitates the loading and resolution of pipeline declarations and configurations for the industry index application.</purpose>
<keywords>pipeline, declaration, configuration, loaders</keywords>
<responsibilities>
  <item>Loads pipeline, phase, and Gogol declarations from a specified directory.</item>
  <item>Resolves enabled member IDs based on provided references.</item>
  <item>Reads configuration strings and arrays, both required and optional.</item>
  <item>Transforms pipeline phase and step declarations into guide seeds.</item>
</responsibilities>
<non-goals>
  <item>Do not parse raw content from declaration files.</item>
  <item>Do not manage transport or orchestration of configuration data.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="loadPipelineDeclaration">Loads the main pipeline declaration.</entry>
  <entry key="loadPhaseDeclaration">Loads individual phase declarations.</entry>
  <entry key="loadGogolDeclaration">Loads Gogol step declarations.</entry>
  <entry key="resolveEnabledMemberIds">Resolves member IDs for enabled declarations.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill GRACE scaffolding to enhance navigability and maintainability of the declaration module.</item>
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

export const resolveEnabledMemberIds = (options: {
  members: DeclarationMemberReference[];
}): string[] => declarationLoaders.resolveEnabledMemberIds(options);

export const toPhaseGuideSeed = toPipelinePhaseGuideSeed;
export const toGogolGuideSeed = toPipelineStepGuideSeed;
export const readConfigString = readDeclarationConfigString;
export const readOptionalConfigString = readOptionalDeclarationConfigString;
export const readConfigStringArray = readDeclarationConfigStringArray;
export const readOptionalConfigStringArray = readOptionalDeclarationConfigStringArray;

