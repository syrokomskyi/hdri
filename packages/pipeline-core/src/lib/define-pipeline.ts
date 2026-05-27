import type { PipelinePhase } from "./pipeline-phase.js";
import type { PipelineDefinition, PipelineStepLike } from "./pipeline-types.js";

export const definePipeline = <TStep extends PipelineStepLike>(options: {
  title: string;
  summary: string;
  quickStart?: string[];
  operatingRules?: string[];
  phases: PipelinePhase<TStep>[];
}): PipelineDefinition<TStep> => {
  return {
    title: options.title,
    summary: options.summary,
    quickStart: options.quickStart,
    operatingRules: options.operatingRules,
    phases: options.phases,
    steps: options.phases.flatMap((phase) => phase.getSteps()),
  };
};
