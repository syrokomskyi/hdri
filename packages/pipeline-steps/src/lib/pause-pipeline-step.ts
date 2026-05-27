import { PipelinePauseError, PipelineStep } from "@org/pipeline-core";
import type { PipelineStepContext } from "@org/pipeline-core";

export class PausePipelineStep<
  TContext extends PipelineStepContext = PipelineStepContext,
> extends PipelineStep<TContext> {
  readonly id: string;
  override readonly retryPolicy = "none" as const;
  readonly #message: string;

  constructor(options: { id?: string; message?: string } = {}) {
    super();
    this.id = options.id ?? "pause-pipeline";
    this.#message = options.message ?? "Pipeline paused.";
  }

  override async run(ctx: TContext): Promise<void> {
    void ctx;
    throw new PipelinePauseError(this.#message);
  }
}
