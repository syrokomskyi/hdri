/*
<MODULE_CONTRACT>
<purpose>Provides a factory for generating app-local declaration modules, eliminating boilerplate re-exports across apps.</purpose>
<non-goals>
  <item>Does not implement declaration parsing logic — delegates to createPipelineDeclarationLoaders.</item>
  <item>Does not execute pipeline steps or phases.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of createAppDeclarationModule factory.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPipelineDeclarationLoaders,
  readDeclarationConfigFiniteNumber,
  readDeclarationConfigString,
  readDeclarationConfigStringArray,
  readOptionalDeclarationConfigString,
  readOptionalDeclarationConfigStringArray,
  toPipelinePhaseGuideSeed,
  toPipelineStepGuideSeed,
  type DeclarationMemberReference,
  type PipelinePhaseDeclaration,
  type PipelineRouteDeclaration,
  type PipelineStepDeclaration,
} from "./pipeline-declarations.js";

export type AppDeclarationModule<TFeature extends string = string> = {
  PIPELINE_DECLARATION_LANGUAGE: string;
  loadPipelineDeclaration: (options?: { language?: string }) => PipelineRouteDeclaration<TFeature>;
  loadPhaseDeclaration: (options: {
    id: string;
    language?: string;
  }) => PipelinePhaseDeclaration<TFeature>;
  loadGogolDeclaration: (options: { id: string; language?: string }) => PipelineStepDeclaration;
  resolveEnabledMemberIds: (options: {
    members: DeclarationMemberReference<TFeature>[];
    features?: Record<TFeature, boolean>;
  }) => string[];
  toPhaseGuideSeed: typeof toPipelinePhaseGuideSeed;
  toGogolGuideSeed: typeof toPipelineStepGuideSeed;
  readConfigString: typeof readDeclarationConfigString;
  readOptionalConfigString: typeof readOptionalDeclarationConfigString;
  readConfigStringArray: typeof readDeclarationConfigStringArray;
  readOptionalConfigStringArray: typeof readOptionalDeclarationConfigStringArray;
  readConfigNumber: typeof readDeclarationConfigFiniteNumber;
};

export type AppDeclarationModuleOptions = {
  moduleUrl: string;
  defaultLanguage?: string;
  configMode?: "nested" | "remaining_fields";
};

/**
 * Creates the full set of declaration exports that apps typically re-export
 * from their local declaration.ts. This eliminates ~60-80 lines of boilerplate
 * per app.
 *
 * Usage in app declaration.ts:
 * ```ts
 * import { createAppDeclarationModule } from "@syrokomskyi/pipeline-node/declarations";
 *
 * const decl = createAppDeclarationModule({ moduleUrl: import.meta.url });
 *
 * export const PIPELINE_DECLARATION_LANGUAGE = decl.PIPELINE_DECLARATION_LANGUAGE;
 * export const loadPipelineDeclaration = decl.loadPipelineDeclaration;
 * export const loadPhaseDeclaration = decl.loadPhaseDeclaration;
 * export const loadGogolDeclaration = decl.loadGogolDeclaration;
 * export const resolveEnabledMemberIds = decl.resolveEnabledMemberIds;
 * export const toPhaseGuideSeed = decl.toPhaseGuideSeed;
 * export const toGogolGuideSeed = decl.toGogolGuideSeed;
 * export const readConfigString = decl.readConfigString;
 * export const readOptionalConfigString = decl.readOptionalConfigString;
 * export const readConfigStringArray = decl.readConfigStringArray;
 * export const readOptionalConfigStringArray = decl.readOptionalConfigStringArray;
 * export const readConfigNumber = decl.readConfigNumber;
 * ```
 */
export const createAppDeclarationModule = <TFeature extends string = string>(
  options: AppDeclarationModuleOptions,
): AppDeclarationModule<TFeature> => {
  const defaultLanguage = options.defaultLanguage ?? "en";
  const configMode = options.configMode ?? "nested";

  const declarationRootDir = path.join(
    path.dirname(fileURLToPath(options.moduleUrl)),
    "..",
    "pipeline-definition",
  );

  const loaders = createPipelineDeclarationLoaders<TFeature>({
    declarationRootDir,
    defaultLanguage,
    configMode,
  });

  return {
    PIPELINE_DECLARATION_LANGUAGE: defaultLanguage,
    loadPipelineDeclaration: loaders.loadPipelineDeclaration,
    loadPhaseDeclaration: loaders.loadPhaseDeclaration,
    loadGogolDeclaration: loaders.loadStepDeclaration,
    resolveEnabledMemberIds:
      loaders.resolveEnabledMemberIds as unknown as AppDeclarationModule<TFeature>["resolveEnabledMemberIds"],
    toPhaseGuideSeed: toPipelinePhaseGuideSeed,
    toGogolGuideSeed: toPipelineStepGuideSeed,
    readConfigString: readDeclarationConfigString,
    readOptionalConfigString: readOptionalDeclarationConfigString,
    readConfigStringArray: readDeclarationConfigStringArray,
    readOptionalConfigStringArray: readOptionalDeclarationConfigStringArray,
    readConfigNumber: readDeclarationConfigFiniteNumber,
  };
};

// Re-export types that apps commonly use
export type {
  DeclarationMemberReference,
  PipelinePhaseDeclaration,
  PipelineRouteDeclaration,
  PipelineStepDeclaration,
};
