/*
<MODULE_CONTRACT>
<purpose>Provides a factory for generating app-local gogol registries, eliminating boilerplate in apps that map declaration factory ids to concrete step instances.</purpose>
<non-goals>
  <item>Does not define concrete step behavior or business logic.</item>
  <item>Does not handle declaration loading or parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of createGogolRegistry factory.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineStepGuideSeed, PipelineStepLike } from "@syrokomskyi/pipeline-core";
import type { PipelineStepDeclaration } from "./pipeline-declarations.js";

export type GogolRegistryFactoryOptions = {
  id: string;
  config: Record<string, unknown>;
};

export type CreateGogolRegistryOptions<
  TStep extends PipelineStepLike<any> & { withExplanation(guide: PipelineStepGuideSeed): TStep },
> = {
  loadGogolDeclaration: (options: { id: string; language?: string }) => PipelineStepDeclaration;
  toGogolGuideSeed: (declaration: PipelineStepDeclaration) => PipelineStepGuideSeed;
  factories: Record<string, (options: GogolRegistryFactoryOptions) => TStep>;
};

/**
 * Creates an app-local `createGogolById` function that maps declaration
 * factory ids to concrete step instances. This eliminates the repetitive
 * boilerplate of loading declarations, looking up factories, and attaching
 * guide seeds.
 *
 * Usage in app gogol-registry.ts:
 * ```ts
 * import { createGogolRegistry } from "@syrokomskyi/pipeline-node/declarations";
 * import { loadGogolDeclaration, toGogolGuideSeed } from "./declaration";
 * import type { Gogol } from "./Gogol";
 *
 * export const createGogolById = createGogolRegistry<Gogol>({
 *   loadGogolDeclaration,
 *   toGogolGuideSeed,
 *   factories: {
 *     "city-illustration": () => new CityIllustrationGogol(),
 *     "remove-background": () => new RemoveBackgroundGogol(),
 *   },
 * });
 * ```
 *
 * For factories that need declaration config or the gogol id:
 * ```ts
 * "wait-human": ({ id, config }) => new WaitHumanGogol({
 *   id,
 *   message: readConfigString(config, "message"),
 * }),
 * ```
 */
export const createGogolRegistry = <
  TStep extends PipelineStepLike<any> & { withExplanation(guide: PipelineStepGuideSeed): TStep },
>(
  options: CreateGogolRegistryOptions<TStep>,
) => {
  return (id: string, context: { declarationLanguage: string }): TStep => {
    const declaration = options.loadGogolDeclaration({
      id,
      language: context.declarationLanguage,
    });

    const factory = options.factories[declaration.factory];
    if (!factory) {
      throw new Error(`Unknown gogol factory: ${declaration.factory} (gogol id: ${id})`);
    }

    const step = factory({ id, config: declaration.config });
    return step.withExplanation(options.toGogolGuideSeed(declaration));
  };
};
