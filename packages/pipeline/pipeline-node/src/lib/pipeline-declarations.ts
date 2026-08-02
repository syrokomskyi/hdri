/*
<MODULE_CONTRACT>
<purpose>Defines and manages the loading and configuration of pipeline declarations using frontmatter data.</purpose>
<non-goals>
  <item>Does not execute pipeline phases or steps.</item>
  <item>Does not handle runtime pipeline execution logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of pipeline declaration loaders and utilities.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import type {
  PipelinePhaseGuideSeed,
  PipelineStepAiModelUsage,
  PipelineStepDecisionType,
  PipelineStepGuideSeed,
} from "@syrokomskyi/pipeline-core";
import {
  createCachedFrontmatterFileReader,
  expectFrontmatterString,
  readFrontmatterFiniteNumber,
  readFrontmatterStringArray,
  readOptionalFrontmatterString,
  readOptionalFrontmatterStringArray,
} from "./frontmatter.js";

export type DeclarationMemberReference<TFeature extends string = string> = {
  id: string;
  whenFeature?: TFeature;
};

export type PipelineRouteDeclaration<TFeature extends string = string> = {
  title: string;
  quickStart: string[];
  operatingRules: string[];
  members: DeclarationMemberReference<TFeature>[];
};

export type PipelinePhaseDeclaration<TFeature extends string = string> = {
  id: string;
  title: string;
  purpose: string;
  entryCriteria?: string[];
  successSignals?: string[];
  exitCriteria?: string[];
  members: DeclarationMemberReference<TFeature>[];
};

export type PipelineStepDeclaration = {
  id: string;
  factory: string;
  title: string;
  purpose: string;
  inputs: string[];
  outputs?: string[];
  definitionOfDone?: string[];
  decisionType?: PipelineStepDecisionType;
  notes?: string[];
  aiModelUsage?: PipelineStepAiModelUsage[];
  config: Record<string, unknown>;
};

type ConfigMode = "nested" | "remaining_fields";

type MatterData = Record<string, unknown>;

export type CreatePipelineDeclarationLoadersOptions<TFeature extends string = string> = {
  declarationRootDir: string;
  defaultLanguage: string;
  configMode?: ConfigMode;
  memberFeatures?: readonly TFeature[];
};

const readAiModelUsage = (
  value: unknown,
  label: string,
): PipelineStepAiModelUsage[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of objects`);
  }

  const entries = value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${label}[${index}] must be an object`);
    }

    const record = entry as Record<string, unknown>;
    return {
      modelSource: expectFrontmatterString(record.modelSource, `${label}[${index}].modelSource`),
      maxTokens:
        record.maxTokens !== undefined
          ? readFrontmatterFiniteNumber(record.maxTokens, `${label}[${index}].maxTokens`)
          : undefined,
      purpose: expectFrontmatterString(record.purpose, `${label}[${index}].purpose`),
    };
  });

  return entries.length > 0 ? entries : undefined;
};

const readDecisionType = (value: unknown, label: string): PipelineStepDecisionType | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    value !== "auto" &&
    value !== "human_confirms" &&
    value !== "human_provides_content" &&
    value !== "human_reviews" &&
    value !== "client_chooses"
  ) {
    throw new Error(
      `${label} must be auto, human_confirms, human_provides_content, human_reviews, or client_chooses`,
    );
  }

  return value;
};

const createMemberReferenceReader = <TFeature extends string = never>(
  memberFeatures?: readonly TFeature[],
) => {
  const supportedFeatures = new Set(memberFeatures ?? []);

  return (value: unknown, label: string): DeclarationMemberReference<TFeature> => {
    if (typeof value === "string") {
      return {
        id: expectFrontmatterString(value, `${label}.id`),
      };
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be a string or object with id`);
    }

    const record = value as Record<string, unknown>;
    const whenFeature = record.whenFeature;

    if (whenFeature !== undefined) {
      if (memberFeatures === undefined || !supportedFeatures.has(whenFeature as TFeature)) {
        const allowedValues = Array.from(supportedFeatures).join(", ");
        throw new Error(
          allowedValues.length > 0
            ? `${label}.whenFeature must be one of: ${allowedValues}`
            : `${label}.whenFeature is not supported here`,
        );
      }
    }

    return {
      id: expectFrontmatterString(record.id, `${label}.id`),
      whenFeature: whenFeature as TFeature | undefined,
    };
  };
};

const omitReservedFields = (data: MatterData, reservedKeys: string[]): Record<string, unknown> => {
  const reserved = new Set(reservedKeys);
  return Object.fromEntries(Object.entries(data).filter(([key]) => !reserved.has(key)));
};

const readDeclarationConfig = (options: {
  data: MatterData;
  configMode: ConfigMode;
  reservedKeys: string[];
}): Record<string, unknown> => {
  if (options.configMode === "nested") {
    const config = options.data.config;
    return config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  }

  return omitReservedFields(options.data, options.reservedKeys);
};

export const createPipelineDeclarationLoaders = <TFeature extends string = string>(
  options: CreatePipelineDeclarationLoadersOptions<TFeature>,
) => {
  const readMatterFile = createCachedFrontmatterFileReader();
  const readMemberReference = createMemberReferenceReader(options.memberFeatures);
  const configMode = options.configMode ?? "nested";

  const getDeclarationPath = (pathOptions: {
    language: string;
    kind: "pipeline" | "phases" | "gogols";
    id?: string;
  }): string => {
    if (pathOptions.kind === "pipeline") {
      return path.join(options.declarationRootDir, pathOptions.language, "pipeline.md");
    }

    return path.join(
      options.declarationRootDir,
      pathOptions.language,
      pathOptions.kind,
      `${pathOptions.id ?? ""}.md`,
    );
  };

  const readMemberReferenceArray = (
    value: unknown,
    label: string,
  ): DeclarationMemberReference<TFeature>[] => {
    if (!Array.isArray(value)) {
      throw new Error(`${label} must be an array`);
    }

    return value.map((entry, index) => readMemberReference(entry, `${label}[${index}]`));
  };

  const loadPipelineDeclaration = (
    loadOptions: { language?: string } = {},
  ): PipelineRouteDeclaration<TFeature> => {
    const language = loadOptions.language ?? options.defaultLanguage;
    const parsed = readMatterFile(
      getDeclarationPath({
        language,
        kind: "pipeline",
      }),
    );

    return {
      title: expectFrontmatterString(parsed.data.title, "pipeline.title"),
      quickStart: readFrontmatterStringArray(parsed.data.quickStart, "pipeline.quickStart"),
      operatingRules: readFrontmatterStringArray(
        parsed.data.operatingRules,
        "pipeline.operatingRules",
      ),
      members: readMemberReferenceArray(parsed.data.members, "pipeline.members"),
    };
  };

  const loadPhaseDeclaration = (loadOptions: {
    id: string;
    language?: string;
  }): PipelinePhaseDeclaration<TFeature> => {
    const language = loadOptions.language ?? options.defaultLanguage;
    const parsed = readMatterFile(
      getDeclarationPath({
        language,
        kind: "phases",
        id: loadOptions.id,
      }),
    );

    return {
      id: loadOptions.id,
      title: expectFrontmatterString(parsed.data.title, `phase ${loadOptions.id}.title`),
      purpose:
        readOptionalFrontmatterString(parsed.data.purpose) ??
        parsed.content ??
        `Run phase \`${loadOptions.id}\`.`,
      entryCriteria: readOptionalFrontmatterStringArray(
        parsed.data.entryCriteria,
        `phase ${loadOptions.id}.entryCriteria`,
      ),
      successSignals: readOptionalFrontmatterStringArray(
        parsed.data.successSignals,
        `phase ${loadOptions.id}.successSignals`,
      ),
      exitCriteria: readOptionalFrontmatterStringArray(
        parsed.data.exitCriteria,
        `phase ${loadOptions.id}.exitCriteria`,
      ),
      members: readMemberReferenceArray(parsed.data.members, `phase ${loadOptions.id}.members`),
    };
  };

  const loadStepDeclaration = (loadOptions: {
    id: string;
    language?: string;
  }): PipelineStepDeclaration => {
    const language = loadOptions.language ?? options.defaultLanguage;
    const parsed = readMatterFile(
      getDeclarationPath({
        language,
        kind: "gogols",
        id: loadOptions.id,
      }),
    );

    return {
      id: loadOptions.id,
      factory: readOptionalFrontmatterString(parsed.data.factory) ?? loadOptions.id,
      title: expectFrontmatterString(parsed.data.title, `gogol ${loadOptions.id}.title`),
      purpose:
        readOptionalFrontmatterString(parsed.data.purpose) ??
        parsed.content ??
        `Run the operational step \`${loadOptions.id}\`.`,
      inputs: readFrontmatterStringArray(parsed.data.inputs, `gogol ${loadOptions.id}.inputs`),
      outputs: readOptionalFrontmatterStringArray(
        parsed.data.outputs,
        `gogol ${loadOptions.id}.outputs`,
      ),
      definitionOfDone: readOptionalFrontmatterStringArray(
        parsed.data.definitionOfDone,
        `gogol ${loadOptions.id}.definitionOfDone`,
      ),
      decisionType: readDecisionType(
        parsed.data.decisionType,
        `gogol ${loadOptions.id}.decisionType`,
      ),
      notes: readOptionalFrontmatterStringArray(parsed.data.notes, `gogol ${loadOptions.id}.notes`),
      aiModelUsage: readAiModelUsage(
        parsed.data.aiModelUsage,
        `gogol ${loadOptions.id}.aiModelUsage`,
      ),
      config: readDeclarationConfig({
        data: parsed.data,
        configMode,
        reservedKeys: [
          "config",
          "title",
          "purpose",
          "details",
          "inputs",
          "outputs",
          "definitionOfDone",
          "decisionType",
          "notes",
          "aiModelUsage",
          "factory",
        ],
      }),
    };
  };

  const resolveEnabledMemberIds = (resolveOptions: {
    members: DeclarationMemberReference<TFeature>[];
    features?: Record<TFeature, boolean>;
  }): string[] => {
    return resolveOptions.members.flatMap((member) => {
      if (!member.whenFeature) {
        return [member.id];
      }

      return resolveOptions.features?.[member.whenFeature] ? [member.id] : [];
    });
  };

  return {
    getDeclarationPath,
    loadPipelineDeclaration,
    loadPhaseDeclaration,
    loadStepDeclaration,
    resolveEnabledMemberIds,
  };
};

export const toPipelinePhaseGuideSeed = <TFeature extends string = string>(
  declaration: PipelinePhaseDeclaration<TFeature>,
): PipelinePhaseGuideSeed => {
  return {
    title: declaration.title,
    purpose: declaration.purpose,
    entryCriteria: declaration.entryCriteria,
    successSignals: declaration.successSignals,
    exitCriteria: declaration.exitCriteria,
  };
};

export const createDeclaredPhaseOptions = <TMember, TFeature extends string = string>(options: {
  id: string;
  language: string;
  loadPhaseDeclaration: (loadOptions: {
    id: string;
    language?: string;
  }) => PipelinePhaseDeclaration<TFeature>;
  resolveEnabledMemberIds: (resolveOptions: {
    members: DeclarationMemberReference<TFeature>[];
    features?: Record<TFeature, boolean>;
  }) => string[];
  createMember: (id: string) => TMember;
  features?: Record<TFeature, boolean>;
}): {
  id: string;
  members: TMember[];
  explain: PipelinePhaseGuideSeed;
} => {
  const declaration = options.loadPhaseDeclaration({
    id: options.id,
    language: options.language,
  });

  const memberIds = options.resolveEnabledMemberIds({
    members: declaration.members,
    features: options.features,
  });

  return {
    id: options.id,
    members: memberIds.map((memberId) => options.createMember(memberId)),
    explain: toPipelinePhaseGuideSeed(declaration),
  };
};

export const toPipelineStepGuideSeed = (
  declaration: PipelineStepDeclaration,
): PipelineStepGuideSeed => {
  return {
    title: declaration.title,
    purpose: declaration.purpose,
    inputs: declaration.inputs,
    outputs: declaration.outputs,
    definitionOfDone: declaration.definitionOfDone,
    decisionType: declaration.decisionType,
    notes: declaration.notes,
    aiModelUsage: declaration.aiModelUsage,
  };
};

export const readDeclarationConfigString = (
  config: Record<string, unknown> | undefined,
  key: string,
): string => {
  return expectFrontmatterString(config?.[key], `gogol.config.${key}`);
};

export const readOptionalDeclarationConfigString = (
  config: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  return readOptionalFrontmatterString(config?.[key]);
};

export const readDeclarationConfigStringArray = (
  config: Record<string, unknown> | undefined,
  key: string,
): string[] => {
  return readFrontmatterStringArray(config?.[key], `gogol.config.${key}`);
};

export const readOptionalDeclarationConfigStringArray = (
  config: Record<string, unknown> | undefined,
  key: string,
): string[] | undefined => {
  return readOptionalFrontmatterStringArray(config?.[key], `gogol.config.${key}`);
};

export const readDeclarationConfigFiniteNumber = (
  config: Record<string, unknown> | undefined,
  key: string,
): number => {
  return readFrontmatterFiniteNumber(config?.[key], `gogol.config.${key}`);
};

export const readDeclarationConfigBoolean = (
  config: Record<string, unknown> | undefined,
  key: string,
): boolean => {
  if (typeof config?.[key] !== "boolean") {
    throw new Error(`gogol.config.${key} must be a boolean`);
  }

  return config[key] as boolean;
};

export * from "./app-declaration-module.js";
export * from "./gogol-registry-factory.js";
export * from "./phase-registry-factory.js";
