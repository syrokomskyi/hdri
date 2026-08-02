/*
<MODULE_CONTRACT>
<purpose>Creates the contract-ontology pipeline context with gogol helpers and state.</purpose>
<non-goals>
  <item>Do not implement AI service integration — contract-ontology has none.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Replace createNodePipelineContext boilerplate with shared createHdriFactoryContext from @syrokomskyi/factory-core.</item>
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
