/*
<MODULE_CONTRACT>
<purpose>Sets up declaration loading from pipeline-definition markdown files and re-exports shared declaration helpers.</purpose>
<keywords>declaration, pipeline, phase, gogol, loader, markdown</keywords>
<responsibilities>
  <item>Defines the pipeline declaration root directory and language.</item>
  <item>Creates declaration loaders for pipeline, phase, and gogol declarations.</item>
  <item>Re-exports shared helper functions for declaration config reading and guide seed generation.</item>
  <item>Re-exports declaration types specific to this pipeline.</item>
</responsibilities>
<non-goals>
  <item>Does not define actual pipeline phases or gogol classes.</item>
  <item>Does not contain any runtime orchestration logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PIPELINE_DECLARATION_LANGUAGE">Default language for declaration markdown files.</entry>
  <entry key="PipelineDeclaration">Type alias for the shared pipeline declaration type.</entry>
  <entry key="PhaseDeclaration">Type alias for the shared phase declaration type.</entry>
  <entry key="GogolDeclaration">Type alias for the shared gogol step declaration type.</entry>
  <entry key="DeclarationMemberReference">Re-exported declaration member reference type.</entry>
  <entry key="loadPipelineDeclaration">Loads a pipeline declaration from markdown.</entry>
  <entry key="loadPhaseDeclaration">Loads a phase declaration from markdown.</entry>
  <entry key="loadGogolDeclaration">Loads a gogol declaration from markdown.</entry>
  <entry key="resolveEnabledMemberIds">Resolves which member IDs are enabled based on declaration config.</entry>
  <entry key="toPhaseGuideSeed">Converts a phase declaration to a guide seed object.</entry>
  <entry key="toGogolGuideSeed">Converts a gogol declaration to a guide seed object.</entry>
  <entry key="readConfigString">Reads a required string config from declaration metadata.</entry>
  <entry key="readOptionalConfigString">Reads an optional string config from declaration metadata.</entry>
  <entry key="readConfigStringArray">Reads a string array config from declaration metadata.</entry>
  <entry key="readOptionalConfigStringArray">Reads an optional string array config from declaration metadata.</entry>
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

export const resolveEnabledMemberIds = (options: {
  members: DeclarationMemberReference[];
}): string[] => declarationLoaders.resolveEnabledMemberIds(options);

export const toPhaseGuideSeed = toPipelinePhaseGuideSeed;
export const toGogolGuideSeed = toPipelineStepGuideSeed;
export const readConfigString = readDeclarationConfigString;
export const readOptionalConfigString = readOptionalDeclarationConfigString;
export const readConfigStringArray = readDeclarationConfigStringArray;
export const readOptionalConfigStringArray = readOptionalDeclarationConfigStringArray;

