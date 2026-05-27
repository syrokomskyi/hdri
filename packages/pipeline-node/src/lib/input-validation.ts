import path from "node:path";
import fs from "node:fs/promises";

import { PipelinePauseError } from '@org/pipeline-core';
import type { NodePipelineContext } from "./node-pipeline-types.js";

export type RequireInputFilesOptions<TState = unknown, TServices = unknown> = {
  ctx: NodePipelineContext<TState, TServices>;
  allowedExtensions: string[];
  description: string;
  excludeRelativePaths?: string[];
};

const normalizeRelativePath = (relativePath: string): string => {
  return relativePath.replaceAll("\\", "/").toLowerCase();
};

const collectFilesRecursively = async (
  dirPath: string,
  baseDir: string,
  allowedExtensions: Set<string>
): Promise<string[]> => {
  const fileNames: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Recursively collect files from subdirectories
      const subDirFiles = await collectFilesRecursively(fullPath, baseDir, allowedExtensions);
      fileNames.push(...subDirFiles);
    } else if (entry.isFile()) {
      // Check if file matches allowed extensions and doesn't start with "-"
      const ext = path.extname(entry.name).toLowerCase();
      if (
        allowedExtensions.has(ext) &&
        !entry.name.startsWith("-")
      ) {
        // Store relative path from inputDir
        const relativePath = path.relative(baseDir, fullPath);
        fileNames.push(relativePath);
      }
    }
  }

  return fileNames;
};

export const requireInputFiles = async <TState = unknown, TServices = unknown>(
  options: RequireInputFilesOptions<TState, TServices>
): Promise<string[]> => {
  const allowedExtensions = new Set(options.allowedExtensions.map((ext) => ext.toLowerCase()));
  const excludedRelativePaths = new Set(
    (options.excludeRelativePaths ?? []).map(normalizeRelativePath)
  );
  const fileNames = (await collectFilesRecursively(
    options.ctx.inputDir,
    options.ctx.inputDir,
    allowedExtensions
  )).filter((relativePath) => !excludedRelativePaths.has(normalizeRelativePath(relativePath)));

  if (fileNames.length === 0) {
    throw new PipelinePauseError(
      [
        `Pipeline paused by ${options.ctx.currentStepId ?? "unknown-step"}.`,
        `Missing required manual input in ${options.ctx.inputDir}.`,
        options.description,
        `Expected at least one file with extensions: ${[...allowedExtensions].join(", ")}.`,
        "The pipeline operator should place the required source files into .input and rerun.",
      ].join("\n")
    );
  }

  return fileNames;
};
