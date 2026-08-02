/*
<MODULE_CONTRACT>
<purpose>Generates comprehensive markdown documentation for a given node pipeline definition and writes it to a specified file path.</purpose>
<non-goals>
  <item>Does not execute or modify the pipeline itself.</item>
  <item>Does not handle non-markdown documentation formats.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation for generating and writing pipeline documentation.</item>
  <item>Update import from create-node-pipeline-fs.js to create-node-pipeline-context.js after consolidation.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineDefinition, PipelineStepLike } from "@syrokomskyi/pipeline-core";
import { renderFullPipelineDocumentationMarkdown } from "@syrokomskyi/pipeline-core";

import { writeTextFile } from "./create-node-pipeline-context.js";

export const generateNodePipelineDocumentation = async <TStep extends PipelineStepLike>(options: {
  definition: PipelineDefinition<TStep>;
  outputPath: string;
}): Promise<string> => {
  const markdown = renderFullPipelineDocumentationMarkdown(options.definition);
  await writeTextFile(options.outputPath, markdown);
  return markdown;
};
