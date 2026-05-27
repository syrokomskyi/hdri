/*
<MODULE_CONTRACT>
<purpose>Pipeline declaration loading and configuration helpers for the axe audit app.</purpose>
<keywords>declaration, pipeline, phase, gogol, loader, configuration</keywords>
<responsibilities>
  <item>Set up declaration loaders pointing to the pipeline-definition directory.</item>
  <item>Re-export shared loader functions for pipeline, phase, and gogol declarations.</item>
  <item>Re-export shared declaration config string and array readers.</item>
  <item>Re-export guide seed conversion utilities for phases and steps.</item>
  <item>Re-export the DeclarationMemberReference type.</item>
</responsibilities>
<non-goals>
  <item>Does not define pipeline phases, gogols, or runtime logic.</item>
  <item>Does not execute or orchestrate pipeline steps.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PIPELINE_DECLARATION_LANGUAGE">Default declaration language constant (en).</entry>
  <entry key="PipelineDeclaration">Re-exported shared pipeline declaration type.</entry>
  <entry key="PhaseDeclaration">Re-exported shared phase declaration type.</entry>
  <entry key="GogolDeclaration">Re-exported shared gogol (step) declaration type.</entry>
  <entry key="loadPipelineDeclaration">Load a pipeline route declaration from markdown.</entry>
  <entry key="loadPhaseDeclaration">Load a phase declaration from markdown.</entry>
  <entry key="loadGogolDeclaration">Load a gogol step declaration from markdown.</entry>
  <entry key="resolveEnabledMemberIds">Resolve which member IDs are enabled based on declarations.</entry>
  <entry key="toPhaseGuideSeed">Convert a phase declaration to a guide seed object.</entry>
  <entry key="toGogolGuideSeed">Convert a gogol declaration to a guide seed object.</entry>
  <entry key="readConfigString">Read a required string config value from a declaration.</entry>
  <entry key="readOptionalConfigString">Read an optional string config value from a declaration.</entry>
  <entry key="readConfigStringArray">Read a required string array config value from a declaration.</entry>
  <entry key="readOptionalConfigStringArray">Read an optional string array config value from a declaration.</entry>
  <entry key="DeclarationMemberReference">Re-exported type for declaration member references.</entry>
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

