import { PipelineStep } from '@org/pipeline-core/step';
import type {
  HdriFactoryContext,
  HdriFactoryGogolArtifacts,
} from './types.js';

export abstract class HdriFactoryGogol<
  C extends HdriFactoryContext = HdriFactoryContext,
> extends PipelineStep<C> {
  override readonly artifacts: HdriFactoryGogolArtifacts<C> = {};

  override getPromptFileNames(): string[] {
    return [];
  }

  override getArtifactPath(ctx: C, artifactId: string): string {
    return ctx.getGogolArtifactPath(this.id, artifactId);
  }

  override async shouldSkip(ctx: C): Promise<boolean> {
    return ctx.state.brief.skipGogols.includes(this.id);
  }

  abstract override run(ctx: C): Promise<void>;
}
