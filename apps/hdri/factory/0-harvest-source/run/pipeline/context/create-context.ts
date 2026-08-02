/*
<MODULE_CONTRACT>
<purpose>Facilitates the creation of a pipeline context for managing artifacts and state in a structured manner.</purpose>
<non-goals>
  <item>Do not handle raw content parsing or validation of input data.</item>
  <item>Do not manage the orchestration of pipeline execution or transport mechanisms.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added COMPASS scaffolding to define the architectural role and responsibilities of the context creation function.</item>
  <item>Replace createNodePipelineContext boilerplate with shared createHdriFactoryContext.</item>
</CHANGE_SUMMARY>
*/

import { createHdriFactoryContext } from "@syrokomskyi/factory-core";
import { inputDir, outputRootDir, promptsDir } from "../../config.js";
import type {
  GogolArtifacts,
  PipelineAiServices,
  PipelineContext,
  PipelineState,
} from "../types.js";

export type PipelineClientsForContext = PipelineAiServices;

export const createPipelineContext = (options: {
  gogolArtifactsById: Map<string, GogolArtifacts>;
  gogolNumbers: Map<string, number>;
  state: PipelineState;
  clients: PipelineClientsForContext;
}): PipelineContext =>
  createHdriFactoryContext<PipelineState>({
    inputDir,
    outputDir: outputRootDir,
    promptsDir,
    gogolArtifactsById: options.gogolArtifactsById,
    gogolNumbers: options.gogolNumbers,
    state: options.state,
    clients: options.clients,
  }) as PipelineContext;
