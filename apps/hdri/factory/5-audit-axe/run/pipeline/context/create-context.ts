/*
<MODULE_CONTRACT>
<purpose>Factory that creates the extended pipeline context for site-axe-audit gogols.</purpose>
<non-goals>
  <item>Do not perform DB migrations or I/O beyond context setup.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
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
