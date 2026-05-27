export type PipelineRetryPolicy = "none" | "on_output_invalid";

export type PipelineReusePolicy = "reuse_valid_artifacts" | "always_run";

export type PipelineStepDecisionType =
  | "auto"
  | "human_confirms"
  | "client_chooses";

export type PipelineStepGuideSeed = {
  title: string;
  purpose: string;
  inputs: string[];
  outputs?: string[];
  definitionOfDone?: string[];
  decisionType?: PipelineStepDecisionType;
  nextStep?: string;
  notes?: string[];
};

export type PipelineStepGuide = {
  title: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  definitionOfDone: string[];
  decisionType: PipelineStepDecisionType;
  nextStep?: string;
  notes?: string[];
  phaseId?: string;
};

export type PipelinePhaseGuideSeed = {
  title: string;
  purpose: string;
  entryCriteria?: string[];
  exitCriteria?: string[];
  successSignals?: string[];
};

export type PipelinePhaseGuide = {
  id: string;
  title: string;
  purpose: string;
  stepIds: string[];
  directStepIds?: string[];
  childPhaseIds?: string[];
  parentPhaseId?: string;
  depth?: number;
  entryCriteria?: string[];
  exitCriteria?: string[];
  successSignals?: string[];
};

export type PipelineExecutionGuide = {
  title: string;
  summary: string;
  phases: PipelinePhaseGuide[];
  quickStart?: string[];
  operatingRules?: string[];
};

export type PipelineRunOptions = {
  dryRun?: boolean;
  force?: string[];
  from?: string;
  only?: string[];
  to?: string;
};

export type PipelineAiLogOptions = {
  system?: string;
  userPrompts: string[];
  images?: Buffer[];
  responses?: Array<{
    content: string;
    fileName?: string;
  }>;
  data?: Array<{ buffer: Buffer; extension: string }>;
  llm?: {
    provider: string;
    model: string;
    version?: string;
    parameters?: Record<string, unknown>;
  };
};

export type PipelineExplainContext<
  TStep extends PipelineStepLike<any> = PipelineStepLike<any>,
> = {
  steps: TStep[];
  phases: PipelinePhaseLike<any>[];
  findStep: (stepId: string) => TStep | null;
  findPhase: (phaseId: string) => PipelinePhaseLike<any> | null;
  getStepNumber: (stepId: string) => number | undefined;
  getPreviousStep: (stepId: string) => TStep | null;
  getNextStep: (stepId: string) => TStep | null;
  getPhaseStackForStep: (stepId: string) => PipelinePhaseLike<any>[];
  getPhaseForStep: (stepId: string) => PipelinePhaseLike<any> | null;
};

export type PipelineStepGuideFactory<
  TStep extends PipelineStepLike<any> = PipelineStepLike<any>,
> = (
  context: PipelineExplainContext<TStep>
) => PipelineStepGuideSeed;

export type PipelinePhaseGuideFactory<
  TStep extends PipelineStepLike<any> = PipelineStepLike<any>,
> = (
  context: PipelineExplainContext<TStep>
) => PipelinePhaseGuideSeed;

export type PipelineStepContext<TState = unknown> = {
  state: TState;
  currentStepId: string | null;
  getPipelineOutputDir: () => string;
  getStepNumber: (stepId: string) => number;
  getStepOutputDir: (stepId: string) => string;
  getOutputPath: (stepId: string, baseFileName: string) => string;
  getStepArtifactPath: (stepId: string, artifactId: string) => string;
  ensureOutputDir: (dirPath: string) => Promise<void>;
  fileExists: (filePath: string) => Promise<boolean>;
  assertStepArtifactValid: (stepId: string, artifactId: string) => Promise<void>;
  logStepEvent: (event: {
    event: string;
    stepId?: string;
    attempt?: number;
    status?: string;
    operation?: string;
    provider?: string;
    model?: string;
    artifactId?: string;
    allowCreateStepOutputDir?: boolean;
    details?: Record<string, unknown>;
  }) => Promise<void>;
};

export type PipelineArtifact<TContext extends PipelineStepContext = PipelineStepContext> = {
  relativePath: string;
  kind: "file" | "dir";
  optional?: boolean;
  text?: {
    minLength?: number;
  };
  validate?: (options: { ctx: TContext; absolutePath: string }) => Promise<void>;
};

export type PipelineArtifacts<TContext extends PipelineStepContext = PipelineStepContext> = Record<
  string,
  PipelineArtifact<TContext>
>;

export type PipelinePhaseLike<TStep extends PipelineStepLike<any> = PipelineStepLike<any>> = {
  id: string;
  members: Array<TStep | PipelinePhaseLike<any>>;
  getSteps: () => TStep[];
  getPhases: () => PipelinePhaseLike<any>[];
  explainPhase: (context: PipelineExplainContext<TStep>) => PipelinePhaseGuideSeed;
};

export type PipelineStepLike<
  TContext extends PipelineStepContext<any> = PipelineStepContext<any>,
> = {
  id: string;
  artifacts: PipelineArtifacts<any>;
  guide?: PipelineStepGuide;
  explainStep?(context: PipelineExplainContext<PipelineStepLike<any>>): PipelineStepGuideSeed;
  getPromptFileNames?(): string[];
  shouldSkip?(ctx: TContext): boolean | Promise<boolean>;
  validateBeforeStart?(ctx: TContext): Promise<void>;
  retryPolicy: PipelineRetryPolicy;
  reusePolicy: PipelineReusePolicy;
  run(ctx: TContext): Promise<void>;
};

export type PipelineDefinition<
  TStep extends PipelineStepLike<any> = PipelineStepLike<any>,
> = {
  title: string;
  summary: string;
  quickStart?: string[];
  operatingRules?: string[];
  phases: PipelinePhaseLike<any>[];
  steps: TStep[];
};

export type CreatePipelineContextOptions<
  TState,
  TContext extends PipelineStepContext<TState>,
> = {
  stepArtifactsById: Map<string, PipelineArtifacts<TContext>>;
  stepNumbers: Map<string, number>;
  state: TState;
};

export type PipelineContextFactory<TState, TContext extends PipelineStepContext<TState>> = (
  options: CreatePipelineContextOptions<TState, TContext>
) => TContext;
