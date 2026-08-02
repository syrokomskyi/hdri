/*
<MODULE_CONTRACT>
<purpose>AI call logging utilities for node-based pipeline contexts — persists system prompts, user prompts, responses, images, and usage metadata.</purpose>
<non-goals>
  <item>Does not implement provider-specific call logic or response parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from create-node-pipeline-context.ts to separate AI logging from context assembly.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import type { PipelineAiLogOptions, TokenUsage } from "@syrokomskyi/pipeline-core";

const formatMarkdownValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
};

const getResponseFileName = (
  response: {
    fileName?: string;
  },
  index: number,
): string => {
  return response.fileName ?? `response-${index + 1}.md`;
};

export const createPipelineAiLogger = (options: {
  getCurrentStepId: () => string | null;
  getStepOutputDir: (stepId: string) => string;
  ensureOutputDir: (dirPath: string) => Promise<void>;
  writeTextFile: (filePath: string, content: string) => Promise<void>;
}) => {
  const aiCallCountersByStepId = new Map<string, number>();

  const writeResponses = async (
    callDir: string,
    logOptions: PipelineAiLogOptions,
  ): Promise<void> => {
    for (const [index, response] of (logOptions.responses ?? []).entries()) {
      await options.writeTextFile(
        path.join(callDir, getResponseFileName(response, index)),
        response.content,
      );
    }
  };

  return {
    logAiCall: async (logOptions: PipelineAiLogOptions): Promise<string | null> => {
      const stepId = options.getCurrentStepId();
      if (!stepId) {
        return null;
      }

      const next = (aiCallCountersByStepId.get(stepId) ?? 0) + 1;
      aiCallCountersByStepId.set(stepId, next);

      const callDir = path.join(options.getStepOutputDir(stepId), "AI", `ai-${next}`);
      await options.ensureOutputDir(callDir);

      if (typeof logOptions.system === "string") {
        await options.writeTextFile(path.join(callDir, "system.md"), logOptions.system);
      }

      if (logOptions.llm) {
        const llmLines = [
          "# LLM",
          "",
          `- provider: ${logOptions.llm.provider}`,
          `- model: ${logOptions.llm.model}`,
          `- version: ${logOptions.llm.version ?? logOptions.llm.model}`,
        ];

        for (const [key, value] of Object.entries(logOptions.llm.parameters ?? {})) {
          llmLines.push(`- ${key}:`);
          llmLines.push("```json");
          llmLines.push(formatMarkdownValue(value));
          llmLines.push("```");
        }

        await options.writeTextFile(path.join(callDir, "llm.md"), llmLines.join("\n"));
      }

      for (const [index, userPrompt] of logOptions.userPrompts.entries()) {
        await options.writeTextFile(path.join(callDir, `user-${index + 1}.md`), userPrompt);
      }

      await writeResponses(callDir, logOptions);

      for (const [index, image] of (logOptions.images ?? []).entries()) {
        try {
          const webp = await sharp(image).webp({ quality: 100 }).toBuffer();
          await fs.writeFile(path.join(callDir, `image-${index + 1}.webp`), webp);
        } catch (error) {
          console.error("Failed to convert image to webp for ai call logging:", error);
        }
      }

      for (const [index, data] of (logOptions.data ?? []).entries()) {
        await fs.writeFile(
          path.join(callDir, `data-${index + 1}.${data.extension.replace(/^\.+/, "")}`),
          data.buffer,
        );
      }

      return callDir;
    },
    writeAiResponses: async (
      callDir: string | null,
      responses: PipelineAiLogOptions["responses"],
    ): Promise<void> => {
      if (!callDir || !responses?.length) {
        return;
      }

      await writeResponses(callDir, {
        userPrompts: [],
        responses,
      });
    },
    writeAiUsage: async (callDir: string | null, usage: TokenUsage): Promise<void> => {
      if (!callDir) {
        return;
      }
      await options.writeTextFile(path.join(callDir, "usage.json"), JSON.stringify(usage, null, 2));
    },
  };
};
