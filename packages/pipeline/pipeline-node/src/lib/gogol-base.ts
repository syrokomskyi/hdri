/*
<MODULE_CONTRACT>
<purpose>Provides a factory for generating app-local Gogol base classes, eliminating boilerplate in apps that only differ in skip-check and prompt-file behavior.</purpose>
<non-goals>
  <item>Does not implement concrete step behavior — subclasses define that.</item>
  <item>Does not manage pipeline orchestration or context creation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of createGogolBase factory to eliminate per-app Gogol.ts boilerplate.</item>
</CHANGE_SUMMARY>
*/

import { PipelineStep } from "@syrokomskyi/pipeline-core/step";
import type { PipelineStepContext, PipelineArtifacts } from "@syrokomskyi/pipeline-core";

export type GogolBaseOptions<TContext extends PipelineStepContext> = {
  /**
   * Returns the list of gogol IDs to skip for this run.
   * Used by the base shouldSkip via getSkipIds.
   * Defaults to an empty array (no skips).
   */
  getSkipIds?: (ctx: TContext) => string[];

  /**
   * Custom shouldSkip logic. When provided, overrides the base
   * getSkipIds-based shouldSkip entirely.
   */
  shouldSkip?: (self: PipelineStep<TContext>, ctx: TContext) => Promise<boolean>;

  /**
   * Returns the list of prompt file names for this gogol.
   * Defaults to `[`${this.id}.md`]` (the base PipelineStep behavior).
   */
  getPromptFileNames?: (self: PipelineStep<TContext>) => string[];
};

export type GogolArtifacts<TContext extends PipelineStepContext> = PipelineArtifacts<TContext>;

/**
 * Creates an app-local Gogol base class with configurable skip-check and
 * prompt-file behavior. This eliminates the need for each app to copy
 * Gogol.ts boilerplate that only differs in shouldSkip / getPromptFileNames.
 *
 * The returned class:
 * - Extends PipelineStep<TContext>
 * - Does NOT override getArtifactPath (the base class already calls
 *   ctx.getStepArtifactPath, and app contexts alias getGogolArtifactPath to it)
 */
type GogolBaseClass<TContext extends PipelineStepContext> = abstract new (
  ...args: ConstructorParameters<typeof PipelineStep>
) => PipelineStep<TContext> & {
  readonly artifacts: GogolArtifacts<TContext>;
};

export const createGogolBase = <TContext extends PipelineStepContext>(
  options: GogolBaseOptions<TContext> = {},
): GogolBaseClass<TContext> => {
  const { getSkipIds, shouldSkip: customShouldSkip, getPromptFileNames } = options;

  abstract class GogolBase extends PipelineStep<TContext> {
    override readonly artifacts: GogolArtifacts<TContext> = {};

    override getSkipIds(ctx: TContext): string[] {
      return getSkipIds?.(ctx) ?? [];
    }

    override getPromptFileNames(): string[] {
      if (getPromptFileNames) {
        return getPromptFileNames(this);
      }
      return super.getPromptFileNames();
    }

    override async shouldSkip(ctx: TContext): Promise<boolean> {
      if (customShouldSkip) {
        return customShouldSkip(this, ctx);
      }
      return this.getSkipIds(ctx).includes(this.id);
    }

    abstract override run(ctx: TContext): Promise<void>;
  }

  return GogolBase as unknown as GogolBaseClass<TContext>;
};

/**
 * Skip-check: reads from `ctx.state.brief.skipGogols`.
 * Use when the brief is always present (site, axiom, hdri-observatory).
 */
export const skipFromBrief = <TContext extends PipelineStepContext>(ctx: TContext): string[] =>
  (ctx.state as { brief: { skipGogols: string[] } }).brief.skipGogols;

/**
 * Skip-check: reads from `ctx.state.brief?.skipGogols`.
 * Use when the brief may be absent (city, service, industry).
 */
export const skipFromOptionalBrief = <TContext extends PipelineStepContext>(
  ctx: TContext,
): string[] => (ctx.state as { brief?: { skipGogols: string[] } }).brief?.skipGogols ?? [];

/**
 * Skip-check for multi-brief apps: skips only when every brief in a Map
 * lists the gogol id. Use when the app processes multiple items with
 * individual briefs (image, video).
 */
export const shouldSkipFromBriefsMap = async <TContext extends PipelineStepContext>(
  self: PipelineStep<TContext>,
  ctx: TContext,
): Promise<boolean> => {
  const state = ctx.state as { briefs?: Map<string, { skipGogols: string[] }> };
  const allBriefs = [...(state.briefs?.values() ?? [])];
  if (allBriefs.length === 0) return false;
  return allBriefs.every((b) => b.skipGogols.includes(self.id));
};
