import fs from "node:fs/promises";
import path from "node:path";

import {
  formatDryRunSummary,
  formatForceSummary,
  formatPhaseCompleted,
  formatPhaseStart,
  formatSkippedStep,
  formatStepGuide,
} from "./console-format.js";
import { ArtifactValidationError } from "./errors/artifact-validation-error.js";
import { PipelinePauseError } from "./errors/pipeline-pause-error.js";
import {
  findPipelinePhaseByStepId,
  renderPipelineExecutionGuideMarkdown,
  renderPipelinePhaseGuideMarkdown,
  renderPipelineStepGuideMarkdown,
} from "./pipeline-guide.js";
import type {
  PipelineExecutionGuide,
  PipelineContextFactory,
  PipelineRunOptions,
  PipelineStepContext,
  PipelineStepLike,
  PipelineArtifacts,
} from "./pipeline-types.js";

const buildSelectedStepIdSet = <TStep extends { id: string }>(options: {
  steps: TStep[];
  runOptions: PipelineRunOptions;
}): Set<string> => {
  const { steps, runOptions } = options;
  const allIds = steps.map((step) => step.id);

  const assertKnownId = (stepId: string) => {
    if (!allIds.includes(stepId)) {
      throw new Error(
        `Unknown pipeline step id in execution options: ${stepId}`,
      );
    }
  };

  for (const stepId of runOptions.only ?? []) {
    assertKnownId(stepId);
  }

  if (runOptions.from) {
    assertKnownId(runOptions.from);
  }

  if (runOptions.to) {
    assertKnownId(runOptions.to);
  }

  if ((runOptions.only?.length ?? 0) > 0) {
    return new Set(runOptions.only);
  }

  const fromIndex = runOptions.from ? allIds.indexOf(runOptions.from) : 0;
  const toIndex = runOptions.to
    ? allIds.indexOf(runOptions.to)
    : allIds.length - 1;

  if (fromIndex > toIndex) {
    throw new Error(
      `Invalid execution range: from=${runOptions.from} is after to=${runOptions.to}`,
    );
  }

  return new Set(allIds.slice(fromIndex, toIndex + 1));
};

const classifyArtifactValidationError = async (options: {
  assertAllArtifactsValid: (stepId: string) => Promise<void>;
  error: unknown;
  stepId: string;
}): Promise<ArtifactValidationError | null> => {
  if (options.error instanceof ArtifactValidationError) {
    return options.error;
  }

  try {
    await options.assertAllArtifactsValid(options.stepId);
    return null;
  } catch (validationError) {
    return validationError instanceof ArtifactValidationError
      ? validationError
      : null;
  }
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return String(error);
};

const appendJsonLine = async (filePath: string, payload: Record<string, unknown>) => {
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
};

const sanitizeFileSegment = (value: string): string => {
  return value
    .replaceAll(/[^a-z0-9-]+/gi, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
};

const writeTextFileEnsured = async (filePath: string, content: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
};

const hasPromptPlaceholder = (text: string): boolean => {
  return /\b(?:TODO|TBD)\b/i.test(text);
};

type PromptAwarePipelineContext<TState> = PipelineStepContext<TState> & {
  promptsDir: string;
  readTextFile: (filePath: string) => Promise<string>;
};

const isPromptAwarePipelineContext = <
  TState,
  TContext extends PipelineStepContext<TState>,
>(ctx: TContext): ctx is TContext & PromptAwarePipelineContext<TState> => {
  return (
    typeof (ctx as Record<string, unknown>).promptsDir === "string" &&
    typeof (ctx as Record<string, unknown>).readTextFile === "function"
  );
};

const assertStepPromptTemplateReady = async <
  TState,
  TContext extends PipelineStepContext<TState>,
>(options: { ctx: TContext; step: PipelineStepLike<TContext> }): Promise<void> => {
  const { ctx, step } = options;
  if (!isPromptAwarePipelineContext(ctx)) {
    return;
  }

  const promptFileNames = step.getPromptFileNames?.() ?? [`${step.id}.md`];

  for (const promptFileName of promptFileNames) {
    const promptPath = path.join(ctx.promptsDir, promptFileName);
    if (!(await ctx.fileExists(promptPath))) {
      continue;
    }

    const promptText = await ctx.readTextFile(promptPath);
    if (!hasPromptPlaceholder(promptText)) {
      continue;
    }

    throw new PipelinePauseError(
      [
        `Pipeline paused by ${step.id}.`,
        `Prompt template is not ready: ${path.basename(promptPath)}.`,
        "The prompt file still contains TODO or TBD placeholders.",
        `Create the prompt for gogol \`${step.id}\` and rerun.`,
      ].join("\n"),
    );
  }
};

export const runPipelineEngine = async <
  TState,
  TContext extends PipelineStepContext<TState>,
  TStep extends PipelineStepLike<TContext>,
>(options: {
  steps: TStep[];
  initialState: TState;
  createContext: PipelineContextFactory<TState, TContext>;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
}): Promise<TContext> => {
  const runOptions = options.options ?? {};
  const stepNumbers = new Map<string, number>(
    options.steps.map((step, index) => [step.id, index + 1]),
  );
  const stepArtifactsById = new Map<string, PipelineArtifacts<TContext>>(
    options.steps.map((step) => [step.id, step.artifacts]),
  );
  const stepGuidesById = new Map(
    options.steps.map((step) => [step.id, step.guide]),
  );
  const selectedStepIds = buildSelectedStepIdSet({
    steps: options.steps,
    runOptions,
  });
  const ctx = options.createContext({
    stepArtifactsById,
    stepNumbers,
    state: options.initialState,
  });

  const assertAllArtifactsValid = async (stepId: string) => {
    const artifacts = stepArtifactsById.get(stepId) ?? {};
    for (const artifactId of Object.keys(artifacts)) {
      await ctx.assertStepArtifactValid(stepId, artifactId);
    }
  };

  const hasAllArtifactsValid = async (stepId: string): Promise<boolean> => {
    try {
      await assertAllArtifactsValid(stepId);
      return true;
    } catch (error) {
      if (error instanceof ArtifactValidationError) {
        return false;
      }

      throw error;
    }
  };

  const hasDeclaredArtifacts = (stepId: string): boolean => {
    const artifacts = stepArtifactsById.get(stepId) ?? {};
    return Object.keys(artifacts).length > 0;
  };

  const writeGuideArtifacts = async () => {
    if (!options.guide) {
      return;
    }

    const guideDir = path.join(ctx.getPipelineOutputDir(), "_guide");
    await ctx.ensureOutputDir(guideDir);

    await writeTextFileEnsured(
      path.join(guideDir, "start-here.md"),
      renderPipelineExecutionGuideMarkdown({
        guide: options.guide,
        stepNumbers,
        stepGuidesById,
      }),
    );

    for (const [index, phase] of options.guide.phases.entries()) {
      await writeTextFileEnsured(
        path.join(
          guideDir,
          `${String(index + 1).padStart(2, "0")}-${sanitizeFileSegment(phase.id)}.md`,
        ),
        renderPipelinePhaseGuideMarkdown({
          phase,
          stepNumbers,
          stepGuidesById,
        }),
      );
    }
  };

  const printStepGuide = (stepId: string) => {
    const step = options.steps.find((candidate) => candidate.id === stepId);
    if (!step?.guide || !options.guide) {
      return;
    }

    const stepNumber = stepNumbers.get(step.id);
    if (stepNumber === undefined) {
      return;
    }

    const phase = findPipelinePhaseByStepId(options.guide, step.id);
    console.log(
      formatStepGuide({
        stepId: step.id,
        stepNumber,
        guide: step.guide,
        phaseTitle: phase?.title,
      })
    );
  };

  const writeStepGuideArtifact = async (stepId: string) => {
    const step = options.steps.find((s) => s.id === stepId);
    if (!step?.guide || !options.guide) {
      return;
    }

    const stepNumber = stepNumbers.get(step.id);
    if (stepNumber === undefined) {
      return;
    }

    const phase = findPipelinePhaseByStepId(options.guide, step.id);

    await writeTextFileEnsured(
      path.join(ctx.getStepOutputDir(step.id), "step-guide.md"),
      renderPipelineStepGuideMarkdown({
        stepId: step.id,
        stepNumber,
        guide: step.guide,
        phaseTitle: phase?.title,
      }),
    );
  };

  const completePhaseIfNeeded = async (stepId: string) => {
    if (!options.guide) {
      return;
    }

    const phases = options.guide.phases
      .filter((phase) => phase.stepIds.includes(stepId))
      .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

    for (const phase of phases) {
      const lastSelectedStepId = phase.stepIds
        .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
        .at(-1);

      if (lastSelectedStepId !== stepId) {
        continue;
      }

      console.log(formatPhaseCompleted(phase));
      await ctx.logStepEvent({
        event: "phase_completed",
        stepId,
        status: "completed",
        details: {
          phaseId: phase.id,
          phaseTitle: phase.title,
        },
      });
    }
  };

  const backupInvalidOutputArtifact = async (backupOptions: {
    attempt: 1 | 2;
    artifactId: string;
    stepId: string;
  }) => {
    const absolutePath = ctx.getStepArtifactPath(
      backupOptions.stepId,
      backupOptions.artifactId,
    );
    const exists = await ctx.fileExists(absolutePath);
    if (!exists) {
      return;
    }

    const nextPath = `${absolutePath}.invalid-${backupOptions.attempt}`;

    try {
      await fs.rename(absolutePath, nextPath);
    } catch (error) {
      console.error(
        `Failed to backup invalid artifact ${backupOptions.stepId}:${backupOptions.artifactId}:`,
        error,
      );
    }
  };

  if (runOptions.dryRun) {
    await writeGuideArtifacts();
    console.log(
      `\n${formatDryRunSummary(
        options.steps
          .filter((step) => selectedStepIds.has(step.id))
          .map((step) => ({
            stepId: step.id,
            outputDir: ctx.getStepOutputDir(step.id),
          }))
      )}`
    );
    ctx.currentStepId = null;
    return ctx;
  }

  if ((runOptions.force?.length ?? 0) > 0) {
    console.log(`\n${formatForceSummary(runOptions.force ?? [])}`);
  }

  const forcedStepIds = new Set(runOptions.force ?? []);
  await writeGuideArtifacts();
  let currentPhaseIds: string[] = [];

  const stepHasExistingArtifacts = async (stepId: string): Promise<boolean> => {
    const artifacts = stepArtifactsById.get(stepId) ?? {};

    for (const artifactId of Object.keys(artifacts)) {
      const artifactPath = ctx.getStepArtifactPath(stepId, artifactId);
      if (await ctx.fileExists(artifactPath)) {
        return true;
      }
    }

    return false;
  };

  for (const step of options.steps) {
    if (!selectedStepIds.has(step.id)) {
      console.log(formatSkippedStep(step.id, "outside selected execution scope"));
      continue;
    }

    ctx.currentStepId = step.id;
    const phaseStack = options.guide
      ? options.guide.phases
        .filter((phase) => phase.stepIds.includes(step.id))
        .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
      : [];
    let sharedPhaseCount = 0;
    while (
      sharedPhaseCount < currentPhaseIds.length &&
      sharedPhaseCount < phaseStack.length &&
      currentPhaseIds[sharedPhaseCount] === phaseStack[sharedPhaseCount]?.id
    ) {
      sharedPhaseCount += 1;
    }

    currentPhaseIds = currentPhaseIds.slice(0, sharedPhaseCount);

    for (const phase of phaseStack.slice(sharedPhaseCount)) {
      currentPhaseIds.push(phase.id);
      console.log(`\n${formatPhaseStart(phase)}`);
      await ctx.logStepEvent({
        event: "phase_started",
        stepId: step.id,
        status: "started",
        allowCreateStepOutputDir: false,
        details: {
          phaseId: phase.id,
          phaseTitle: phase.title,
        },
      });
    }

    printStepGuide(step.id);

    if (
      step.reusePolicy === "reuse_valid_artifacts" &&
      hasDeclaredArtifacts(step.id) &&
      !forcedStepIds.has(step.id) &&
      (await stepHasExistingArtifacts(step.id)) &&
      (await hasAllArtifactsValid(step.id))
    ) {
      console.log(`Skipping step ${step.id}: reusing valid artifacts`);
      await ctx.logStepEvent({
        event: "step_reused",
        stepId: step.id,
        status: "completed",
        details: {
          reason: "all_artifacts_valid",
        },
      });
      await completePhaseIfNeeded(step.id);
      currentPhaseIds = currentPhaseIds.filter((phaseId) => {
        const phase = options.guide?.phases.find((candidate) => candidate.id === phaseId);
        if (!phase) {
          return false;
        }

        const lastSelectedStepId = phase.stepIds
          .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
          .at(-1);

        return lastSelectedStepId !== step.id;
      });
      continue;
    }

    const shouldSkipStep = await step.shouldSkip?.(ctx);

    if (shouldSkipStep) {
      await ctx.ensureOutputDir(ctx.getStepOutputDir(step.id));
      await writeStepGuideArtifact(step.id);
      console.log(formatSkippedStep(step.id, "explicitly skipped by step configuration"));
      await ctx.logStepEvent({
        event: "step_skipped",
        stepId: step.id,
        status: "completed",
        details: {
          reason: "step_should_skip",
        },
      });
      await completePhaseIfNeeded(step.id);
      currentPhaseIds = currentPhaseIds.filter((phaseId) => {
        const phase = options.guide?.phases.find((candidate) => candidate.id === phaseId);
        if (!phase) {
          return false;
        }

        const lastSelectedStepId = phase.stepIds
          .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
          .at(-1);

        return lastSelectedStepId !== step.id;
      });
      continue;
    }

    try {
      await assertStepPromptTemplateReady({ ctx, step });
      await step.validateBeforeStart?.(ctx);
    } catch (error) {
      await ctx.logStepEvent({
        event: "step_paused",
        stepId: step.id,
        status: "paused",
        allowCreateStepOutputDir: false,
        details: {
          reason: error instanceof PipelinePauseError
            ? "input_validation_paused"
            : "input_validation_failed",
          error: getErrorMessage(error),
        },
      });

      if (error instanceof PipelinePauseError) {
        throw error;
      }

      const artifactError = await classifyArtifactValidationError({
        assertAllArtifactsValid,
        error,
        stepId: step.id,
      });

      if (artifactError) {
        throw new PipelinePauseError(
          [
            `Pipeline paused by ${step.id}.`,
            "Invalid input artifact produced by another step.",
            "The pipeline operator should review the step guide above, fix the upstream artifact, and rerun.",
            `Upstream: ${artifactError.ownerStepId}:${artifactError.artifactId}`,
            artifactError.message,
            "Fix the upstream output and rerun.",
          ].join("\n"),
        );
      }

      throw new PipelinePauseError(
        [
          `Pipeline paused by ${step.id}.`,
          "Input validation failed before step execution.",
          "The pipeline operator should review the step guide above, fix the missing or invalid input, and rerun.",
          getErrorMessage(error),
        ].join("\n"),
      );
    }

    await ctx.ensureOutputDir(ctx.getStepOutputDir(step.id));
    await writeStepGuideArtifact(step.id);

    try {
      await appendJsonLine(ctx.getOutputPath(step.id, "log.txt"), {
        timestamp: new Date().toISOString(),
        event: "step_started",
        stepId: step.id,
        stepNumber: ctx.getStepNumber(step.id),
        status: "started",
      });
    } catch (error) {
      console.error(`Failed to write log.txt for ${step.id}:`, error);
    }

    const runOnce = async (attempt: 1 | 2) => {
      await ctx.logStepEvent({
        event: "step_run_started",
        stepId: step.id,
        attempt,
        status: "running",
      });
      console.log(
        `${attempt === 2 ? "retry:" : "run:"} ${step.id}${attempt === 2 ? " (attempt 2)" : ""} running...`
      );
      await step.run(ctx);
      await ctx.logStepEvent({
        event: "step_run_finished",
        stepId: step.id,
        attempt,
        status: "completed",
      });
      await ctx.logStepEvent({
        event: "step_validation_started",
        stepId: step.id,
        attempt,
        status: "running",
      });
      await assertAllArtifactsValid(step.id);
      await ctx.logStepEvent({
        event: "step_validation_finished",
        stepId: step.id,
        attempt,
        status: "completed",
      });
      console.log(`ok: ${step.id} output validated.`);
    };

    try {
      await runOnce(1);
    } catch (error) {
      await ctx.logStepEvent({
        event: "step_run_failed",
        stepId: step.id,
        attempt: 1,
        status: "failed",
        details: {
          error: getErrorMessage(error),
        },
      });
      if (error instanceof PipelinePauseError) {
        throw error;
      }

      const artifactError = await classifyArtifactValidationError({
        assertAllArtifactsValid,
        error,
        stepId: step.id,
      });

      if (!artifactError) {
        throw error;
      }

      if (artifactError.ownerStepId !== step.id) {
        await ctx.logStepEvent({
          event: "step_paused",
          stepId: step.id,
          attempt: 1,
          status: "paused",
          artifactId: artifactError.artifactId,
          details: {
            ownerStepId: artifactError.ownerStepId,
            reason: "invalid_upstream_artifact",
          },
        });
        throw new PipelinePauseError(
          [
            `Pipeline paused by ${step.id}.`,
            "Invalid input artifact produced by another step.",
            "The pipeline operator should review the step guide above, fix the upstream artifact, and rerun.",
            `Upstream: ${artifactError.ownerStepId}:${artifactError.artifactId}`,
            artifactError.message,
            "Fix the upstream output and rerun.",
          ].join("\n"),
        );
      }

      if (step.retryPolicy === "none") {
        await ctx.logStepEvent({
          event: "step_paused",
          stepId: step.id,
          attempt: 1,
          status: "paused",
          artifactId: artifactError.artifactId,
          details: {
            reason: "output_validation_failed_without_retry",
          },
        });
        throw new PipelinePauseError(
          [
            `Pipeline paused by ${step.id}.`,
            "Output validation failed.",
            artifactError.message,
            "This step does not support automatic retry.",
          ].join("\n"),
        );
      }

      console.error(`warn: ${step.id} output validation failed. Retrying once...`);
      await ctx.logStepEvent({
        event: "step_retry_scheduled",
        stepId: step.id,
        attempt: 2,
        status: "scheduled",
        artifactId: artifactError.artifactId,
        details: {
          reason: "output_validation_failed",
        },
      });
      await backupInvalidOutputArtifact({
        attempt: 1,
        artifactId: artifactError.artifactId,
        stepId: step.id,
      });
      await ctx.logStepEvent({
        event: "artifact_backed_up",
        stepId: step.id,
        attempt: 1,
        status: "completed",
        artifactId: artifactError.artifactId,
        details: {
          backupSuffix: ".invalid-1",
        },
      });

      try {
        await runOnce(2);
      } catch (error2) {
        await ctx.logStepEvent({
          event: "step_run_failed",
          stepId: step.id,
          attempt: 2,
          status: "failed",
          details: {
            error: getErrorMessage(error2),
          },
        });
        if (error2 instanceof PipelinePauseError) {
          throw error2;
        }

        const artifactError2 = await classifyArtifactValidationError({
          assertAllArtifactsValid,
          error: error2,
          stepId: step.id,
        });

        if (artifactError2 && artifactError2.ownerStepId === step.id) {
          await backupInvalidOutputArtifact({
            attempt: 2,
            artifactId: artifactError2.artifactId,
            stepId: step.id,
          });
          await ctx.logStepEvent({
            event: "artifact_backed_up",
            stepId: step.id,
            attempt: 2,
            status: "completed",
            artifactId: artifactError2.artifactId,
            details: {
              backupSuffix: ".invalid-2",
            },
          });
          await ctx.logStepEvent({
            event: "step_paused",
            stepId: step.id,
            attempt: 2,
            status: "paused",
            artifactId: artifactError2.artifactId,
            details: {
              reason: "output_validation_failed_twice",
            },
          });
          throw new PipelinePauseError(
            [
              `Pipeline paused by ${step.id}.`,
              "Output validation failed twice.",
              artifactError2.message,
              "Check the *.invalid-1 / *.invalid-2 backups in this step output directory and rerun.",
            ].join("\n"),
          );
        }

        throw error2;
      }
    }

    await completePhaseIfNeeded(step.id);
    currentPhaseIds = currentPhaseIds.filter((phaseId) => {
      const phase = options.guide?.phases.find((candidate) => candidate.id === phaseId);
      if (!phase) {
        return false;
      }

      const lastSelectedStepId = phase.stepIds
        .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
        .at(-1);

      return lastSelectedStepId !== step.id;
    });
  }

  ctx.currentStepId = null;
  return ctx;
};
