/*
<MODULE_CONTRACT>
<purpose>Loads pipeline declarations from markdown files for the observatory app.</purpose>
<non-goals>
  <item>Do not reimplement markdown parsing — use shared loaders.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled declaration re-exports with shared createAppDeclarationModule from @syrokomskyi/pipeline-node/declarations.</item>
</CHANGE_SUMMARY>
*/

import { createAppDeclarationModule } from "@syrokomskyi/pipeline-node/declarations";

import type {
  DeclarationMemberReference as SharedDeclarationMemberReference,
  PipelinePhaseDeclaration,
  PipelineRouteDeclaration,
  PipelineStepDeclaration,
} from "@syrokomskyi/pipeline-node/declarations";

export type DeclarationMemberReference = SharedDeclarationMemberReference<string>;
export type PipelineDeclaration = PipelineRouteDeclaration<string>;
export type PhaseDeclaration = PipelinePhaseDeclaration<string>;
export type GogolDeclaration = PipelineStepDeclaration;

const decl = createAppDeclarationModule({ moduleUrl: import.meta.url });

export const PIPELINE_DECLARATION_LANGUAGE = decl.PIPELINE_DECLARATION_LANGUAGE;
export const loadPipelineDeclaration = decl.loadPipelineDeclaration;
export const loadPhaseDeclaration = decl.loadPhaseDeclaration;
export const loadGogolDeclaration = decl.loadGogolDeclaration;
export const resolveEnabledMemberIds = decl.resolveEnabledMemberIds;
export const toPhaseGuideSeed = decl.toPhaseGuideSeed;
export const toGogolGuideSeed = decl.toGogolGuideSeed;
