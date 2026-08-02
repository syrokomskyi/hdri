/*
<MODULE_CONTRACT>
<purpose>Pipeline declaration loading and configuration helpers for the axe audit app.</purpose>
<non-goals>
  <item>Does not define pipeline phases, gogols, or runtime logic.</item>
  <item>Does not execute or orchestrate pipeline steps.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import { fileURLToPath } from "node:url";
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
} from "@syrokomskyi/pipeline-node/declarations";

export const PIPELINE_DECLARATION_LANGUAGE = "en";
export type { DeclarationMemberReference };
export type PipelineDeclaration = SharedPipelineDeclaration;
export type PhaseDeclaration = SharedPhaseDeclaration;
export type GogolDeclaration = SharedGogolDeclaration;

const declarationRootDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "pipeline-definition",
);

const declarationLoaders = createPipelineDeclarationLoaders({
  declarationRootDir,
  defaultLanguage: PIPELINE_DECLARATION_LANGUAGE,
  configMode: "nested",
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
