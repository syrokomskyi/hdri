/*
<MODULE_CONTRACT>
<purpose>Loads pipeline declarations from markdown files for the contract-ontology app.</purpose>
<non-goals>
  <item>Do not reimplement markdown parsing — use shared loaders.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPipelineDeclarationLoaders,
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

export const resolveEnabledMemberIds = (options: {
  members: DeclarationMemberReference[];
}): string[] => declarationLoaders.resolveEnabledMemberIds(options);

export const toPhaseGuideSeed = toPipelinePhaseGuideSeed;
export const toGogolGuideSeed = toPipelineStepGuideSeed;
