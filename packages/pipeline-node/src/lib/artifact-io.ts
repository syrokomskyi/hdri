import fs from "node:fs/promises";
import path from "node:path";

import { ArtifactValidationError } from '@org/pipeline-core';
import type { PipelineArtifacts } from '@org/pipeline-core';
import type { NodePipelineContext } from "./node-pipeline-types.js";

const defaultTextMinLength = 3;

const toPosixPath = (filePath: string): string => filePath.replaceAll("\\", "/");

const getWorkspaceRoot = <TState, TServices, TExtra extends object>(
  ctx: NodePipelineContext<TState, TServices> & TExtra
): string => {
  const cwd = process.cwd();
  if (path.isAbsolute(cwd)) {
    return cwd;
  }

  return path.dirname(path.resolve(ctx.outputDir));
};

const toDisplayPath = <TState, TServices, TExtra extends object>(
  ctx: NodePipelineContext<TState, TServices> & TExtra,
  targetPath: string
): string => {
  const workspaceRoot = getWorkspaceRoot(ctx);
  const relativePath = path.relative(workspaceRoot, targetPath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return toPosixPath(targetPath);
  }

  return toPosixPath(relativePath);
};

const sanitizeReasonPath = <TState, TServices, TExtra extends object>(options: {
  absolutePath: string;
  ctx: NodePipelineContext<TState, TServices> & TExtra;
  reason: string;
}): string => {
  const absolutePathVariants = [options.absolutePath, toPosixPath(options.absolutePath)].filter(
    (value, index, items) => items.indexOf(value) === index
  );
  const displayPath = toDisplayPath(options.ctx, options.absolutePath);

  return absolutePathVariants.reduce(
    (message, absolutePathVariant) => message.split(absolutePathVariant).join(displayPath),
    options.reason
  );
};

const createArtifactValidationError = <TState, TServices, TExtra extends object>(options: {
  absolutePath: string;
  artifactId: string;
  ctx: NodePipelineContext<TState, TServices> & TExtra;
  ownerStepId: string;
  reason: string;
}): ArtifactValidationError => {
  return new ArtifactValidationError({
    ownerStepId: options.ownerStepId,
    artifactId: options.artifactId,
    absolutePath: options.absolutePath,
    displayPath: toDisplayPath(options.ctx, options.absolutePath),
    reason: sanitizeReasonPath({
      absolutePath: options.absolutePath,
      ctx: options.ctx,
      reason: options.reason,
    }),
  });
};

const ensureFileExists = async (filePath: string) => {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error("Path is not a file");
    }
    return stat;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`File does not exist or not accessible: ${filePath}. ${message}`, {
      cause: error,
    });
  }
};

const ensureDirExists = async (dirPath: string) => {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error("Path is not a directory");
    }
    return stat;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Directory does not exist or not accessible: ${dirPath}. ${message}`, {
      cause: error,
    });
  }
};

export const assertArtifactValid = async <TState, TServices, TExtra extends object>(options: {
  ctx: NodePipelineContext<TState, TServices> & TExtra;
  stepId: string;
  artifactId: string;
  artifactsByStepId: Map<string, PipelineArtifacts<NodePipelineContext<TState, TServices> & TExtra>>;
}): Promise<void> => {
  const artifacts = options.artifactsByStepId.get(options.stepId);
  if (!artifacts) {
    throw new Error(`Unknown pipeline step id: ${options.stepId}`);
  }

  const spec = artifacts[options.artifactId];
  if (!spec) {
    throw new Error(`Unknown artifact id: ${options.artifactId} for step ${options.stepId}`);
  }

  const absolutePath = options.ctx.getStepArtifactPath(options.stepId, options.artifactId);

  if (spec.optional) {
    const exists = await options.ctx.fileExists(absolutePath);
    if (!exists) {
      return;
    }
  }

  let fileStat: { size: number } | null = null;
  try {
    if (spec.kind === "file") {
      fileStat = await ensureFileExists(absolutePath);
    } else {
      await ensureDirExists(absolutePath);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw createArtifactValidationError({
      ctx: options.ctx,
      ownerStepId: options.stepId,
      artifactId: options.artifactId,
      absolutePath,
      reason,
    });
  }

  if (spec.validate) {
    try {
      await spec.validate({ ctx: options.ctx, absolutePath });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw createArtifactValidationError({
        ctx: options.ctx,
        ownerStepId: options.stepId,
        artifactId: options.artifactId,
        absolutePath,
        reason,
      });
    }
    return;
  }

  if (spec.kind !== "file") {
    return;
  }

  const ext = path.extname(spec.relativePath).toLowerCase();

  if ((fileStat?.size ?? 0) <= 0) {
    throw createArtifactValidationError({
      ctx: options.ctx,
      ownerStepId: options.stepId,
      artifactId: options.artifactId,
      absolutePath,
      reason: "File is empty (0 bytes)",
    });
  }

  const isTextByExt = ext === ".md" || ext === ".txt";
  const isJsonByExt = ext === ".json";

  if (isJsonByExt) {
    const text = await options.ctx.readTextFile(absolutePath);
    try {
      JSON.parse(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw createArtifactValidationError({
        ctx: options.ctx,
        ownerStepId: options.stepId,
        artifactId: options.artifactId,
        absolutePath,
        reason: `Invalid JSON: ${reason}`,
      });
    }
    return;
  }

  if (isTextByExt || spec.text) {
    const text = await options.ctx.readTextFile(absolutePath);
    const normalized = text.trim();
    const minLen = spec.text?.minLength ?? defaultTextMinLength;
    if (normalized.length < minLen) {
      throw createArtifactValidationError({
        ctx: options.ctx,
        ownerStepId: options.stepId,
        artifactId: options.artifactId,
        absolutePath,
        reason: `Text is too short: ${normalized.length} < ${minLen}`,
      });
    }
  }
};

export const readArtifactText = async <TState, TServices, TExtra extends object>(options: {
  ctx: NodePipelineContext<TState, TServices> & TExtra;
  stepId: string;
  artifactId: string;
  artifactsByStepId: Map<string, PipelineArtifacts<NodePipelineContext<TState, TServices> & TExtra>>;
}): Promise<string> => {
  await assertArtifactValid(options);
  const absolutePath = options.ctx.getStepArtifactPath(options.stepId, options.artifactId);
  return options.ctx.readTextFile(absolutePath);
};

export const readArtifactJson = async <TState, TServices, TExtra extends object>(options: {
  ctx: NodePipelineContext<TState, TServices> & TExtra;
  stepId: string;
  artifactId: string;
  artifactsByStepId: Map<string, PipelineArtifacts<NodePipelineContext<TState, TServices> & TExtra>>;
}): Promise<unknown> => {
  await assertArtifactValid(options);
  const absolutePath = options.ctx.getStepArtifactPath(options.stepId, options.artifactId);
  const text = await options.ctx.readTextFile(absolutePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw createArtifactValidationError({
      ctx: options.ctx,
      ownerStepId: options.stepId,
      artifactId: options.artifactId,
      absolutePath,
      reason: `Invalid JSON: ${reason}`,
    });
  }
};

export const readArtifactBuffer = async <TState, TServices, TExtra extends object>(options: {
  ctx: NodePipelineContext<TState, TServices> & TExtra;
  stepId: string;
  artifactId: string;
  artifactsByStepId: Map<string, PipelineArtifacts<NodePipelineContext<TState, TServices> & TExtra>>;
}): Promise<Buffer> => {
  await assertArtifactValid(options);
  const absolutePath = options.ctx.getStepArtifactPath(options.stepId, options.artifactId);
  return fs.readFile(absolutePath);
};
