/*
<MODULE_CONTRACT>
<purpose>Facilitates reading and processing prompt files with language and ownership validation.</purpose>
<non-goals>
  <item>Does not handle writing or modifying prompt files.</item>
  <item>Does not manage file system errors beyond reading operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of prompt file reading and validation logic.</item>
  <item>Update import from create-node-pipeline-fs.js to create-node-pipeline-context.js after consolidation.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";

import { PipelinePauseError } from "@syrokomskyi/pipeline-core";

import { readTextFile } from "./create-node-pipeline-context.js";

export type PromptReadOptions = {
  outputLanguage?: string;
  ownerId?: string;
};

export type PromptFileReader = {
  readPromptFile: (fileName: string, options?: PromptReadOptions) => Promise<string>;
};

export type CreatePromptFileReaderOptions = {
  promptsDir: string;
  readTextFile?: (filePath: string) => Promise<string>;
};

const hasPromptPlaceholder = (text: string): boolean => {
  return /\b(?:TODO|TBD)\b/i.test(text);
};

const resolveOwnerId = (fileName: string, ownerId?: string): string => {
  return ownerId?.trim() ?? path.basename(fileName, path.extname(fileName));
};

export const appendOutputLanguageInstruction = (
  promptText: string,
  outputLanguage: string,
): string => {
  return [
    promptText.trimEnd(),
    "",
    "CRITICAL: Produce all natural-language output strictly in the pipeline output language specified below.",
    `CRITICAL: Pipeline output language: ${outputLanguage}.`,
    "CRITICAL: Do not switch to another language unless the prompt explicitly asks for translation into another target language.",
  ].join("\n");
};

export const assertPromptTextReady = (options: {
  fileName: string;
  ownerId?: string;
  text: string;
}): void => {
  if (!hasPromptPlaceholder(options.text)) {
    return;
  }

  const ownerId = resolveOwnerId(options.fileName, options.ownerId);
  throw new PipelinePauseError(
    [
      `Pipeline paused by ${ownerId}.`,
      `Prompt template is not ready: ${options.fileName}.`,
      "The prompt file still contains TODO or TBD placeholders.",
      `Create the prompt for gogol \`${ownerId}\` and rerun.`,
    ].join("\n"),
  );
};

export const readPromptFileFromPath = async (
  filePath: string,
  options: PromptReadOptions = {},
): Promise<string> => {
  const fileName = path.basename(filePath);
  const text = await readTextFile(filePath);

  assertPromptTextReady({
    fileName,
    ownerId: options.ownerId,
    text,
  });

  const outputLanguage = options.outputLanguage?.trim();
  if (!outputLanguage) {
    return text;
  }

  return appendOutputLanguageInstruction(text, outputLanguage);
};

export const createPromptFileReader = (
  options: CreatePromptFileReaderOptions,
): PromptFileReader => {
  const readText = options.readTextFile ?? readTextFile;

  return {
    readPromptFile: async (fileName, readOptions = {}) => {
      const filePath = path.join(options.promptsDir, fileName);
      const text = await readText(filePath);

      assertPromptTextReady({
        fileName,
        ownerId: readOptions.ownerId,
        text,
      });

      const outputLanguage = readOptions.outputLanguage?.trim();
      if (!outputLanguage) {
        return text;
      }

      return appendOutputLanguageInstruction(text, outputLanguage);
    },
  };
};
