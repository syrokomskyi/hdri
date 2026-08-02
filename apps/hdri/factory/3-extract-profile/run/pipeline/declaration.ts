/*
<MODULE_CONTRACT>
<purpose>Sets up declaration loading for the 3-extract-profile pipeline, wrapping shared pipeline-node helpers and re-exporting types.</purpose>
<non-goals>
  <item>Not responsible for pipeline execution or member instantiation.</item>
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
