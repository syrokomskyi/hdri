/*
<MODULE_CONTRACT>
<purpose>Creates an HDRI factory context by integrating pipeline context with additional functionalities.</purpose>
<non-goals>
  <item>Does not handle the execution of HDRI processing steps.</item>
  <item>Does not manage the lifecycle of pipeline artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of HDRI factory context creation.</item>
</CHANGE_SUMMARY>
*/

import { createNodePipelineContext } from "@syrokomskyi/pipeline-node/context";
import type { NodePipelineContext } from "@syrokomskyi/pipeline-node/types";
import type { PipelineArtifacts } from "@syrokomskyi/pipeline-core";
import type {
  HdriFactoryContext,
  HdriFactoryContextExtras,
  HdriFactoryStateBase,
  HdriFactoryEngineClients,
} from "./types.js";

export interface CreateHdriFactoryContextOptions<
  S extends HdriFactoryStateBase = HdriFactoryStateBase,
  Extra extends Record<string, unknown> = Record<string, never>,
> {
  inputDir: string;
  outputDir: string;
  promptsDir: string;
  gogolArtifactsById: Map<string, PipelineArtifacts<HdriFactoryContext<S> & Extra>>;
  gogolNumbers: Map<string, number>;
  state: S;
  clients: HdriFactoryEngineClients;
  extra?: (base: NodePipelineContext<S, HdriFactoryEngineClients>) => Extra;
}

export function createHdriFactoryContext<
  S extends HdriFactoryStateBase = HdriFactoryStateBase,
  Extra extends Record<string, unknown> = Record<string, never>,
>(options: CreateHdriFactoryContextOptions<S, Extra>): HdriFactoryContext<S> & Extra {
  return createNodePipelineContext<S, HdriFactoryEngineClients, HdriFactoryContextExtras & Extra>({
    inputDir: options.inputDir,
    outputDir: options.outputDir,
    promptsDir: options.promptsDir,
    stepArtifactsById: options.gogolArtifactsById,
    stepNumbers: options.gogolNumbers,
    state: options.state,
    services: options.clients,
    extendContext: (base: NodePipelineContext<S, HdriFactoryEngineClients>) => {
      const extras: HdriFactoryContextExtras = {
        get currentGogolId() {
          return base.currentStepId;
        },
        set currentGogolId(v: string | null) {
          base.currentStepId = v;
        },
        getGogolNumber: (id: string) => base.getStepNumber(id),
        getGogolOutputDir: (id: string) => base.getStepOutputDir(id),
        getGogolArtifactPath: (id: string, artifactId: string) =>
          base.getStepArtifactPath(id, artifactId),
        readGogolArtifactText: async (id: string, artifactId: string) =>
          base.readStepArtifactText(id, artifactId),
        readGogolArtifactJson: async (id: string, artifactId: string) =>
          base.readStepArtifactJson(id, artifactId),
      };
      const custom = options.extra ? options.extra(base) : ({} as Extra);
      return { ...extras, ...custom } as HdriFactoryContextExtras & Extra;
    },
  }) as HdriFactoryContext<S> & Extra;
}
