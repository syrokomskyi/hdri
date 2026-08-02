/*
<MODULE_CONTRACT>
<purpose>Provides a factory for generating app-local phase registries, eliminating boilerplate in apps that map phase ids to phase instances with nested member resolution.</purpose>
<non-goals>
  <item>Does not define concrete phase behavior or declaration loading.</item>
  <item>Does not implement step/gogol creation logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of createPhaseRegistry factory.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase, PipelineStepLike } from "@syrokomskyi/pipeline-core";

export type CreatePhaseRegistryOptions<
  TBuildContext,
  TStep extends PipelineStepLike<any>,
  TPhaseId extends string,
> = {
  phaseIds: readonly TPhaseId[];
  createGogolById: (id: string, context: TBuildContext) => TStep;
  createPhase: (options: {
    id: string;
    buildContext: TBuildContext;
    createMember: (id: string) => TStep | PipelinePhase<TStep>;
  }) => PipelinePhase<TStep>;
};

/**
 * Creates an app-local phase registry with `isPhaseId`, `createPhaseById`,
 * and internal `createPipelineMemberById` dispatch. This eliminates the
 * repetitive boilerplate of writing phase-registry.ts by hand.
 *
 * The generated `createPhaseById` passes a `createMember` callback that
 * automatically dispatches to `createPhaseById` for nested phase ids and
 * to `createGogolById` for gogol ids. This replaces the hand-rolled
 * `createPipelineMemberById` function and named phase subclasses in each app.
 *
 * Usage in app phase-registry.ts:
 * ```ts
 * import { createPhaseRegistry } from "@syrokomskyi/pipeline-node/declarations";
 * import { AppPhase } from "./phases/AppPhase";
 * import { createGogolById } from "./gogol-registry";
 * import type { PipelineBuildContext, Gogol } from "./types";
 *
 * const { isPhaseId, createPhaseById } = createPhaseRegistry({
 *   phaseIds: ["illustration"] as const,
 *   createGogolById,
 *   createPhase: (options) => new AppPhase(options),
 * });
 *
 * export { isPhaseId, createPhaseById };
 * ```
 */
export const createPhaseRegistry = <
  TBuildContext,
  TStep extends PipelineStepLike<any>,
  TPhaseId extends string,
>(
  options: CreatePhaseRegistryOptions<TBuildContext, TStep, TPhaseId>,
) => {
  const isPhaseId = (id: string): id is TPhaseId => {
    return (options.phaseIds as readonly string[]).includes(id);
  };

  const createPipelineMemberById = (
    id: string,
    context: TBuildContext,
  ): TStep | PipelinePhase<TStep> => {
    return isPhaseId(id) ? createPhaseById(id, context) : options.createGogolById(id, context);
  };

  const createPhaseById = (id: TPhaseId, buildContext: TBuildContext): PipelinePhase<TStep> => {
    return options.createPhase({
      id,
      buildContext,
      createMember: (memberId: string) => createPipelineMemberById(memberId, buildContext),
    });
  };

  return { isPhaseId, createPhaseById };
};
