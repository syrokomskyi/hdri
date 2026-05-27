import type { PipelineDefinition, PipelineStepLike } from '@org/pipeline-core';
import { renderFullPipelineDocumentationMarkdown } from '@org/pipeline-core';

import { writeTextFile } from './create-node-pipeline-fs.js';

export const generateNodePipelineDocumentation = async <
  TStep extends PipelineStepLike,
>(options: {
  definition: PipelineDefinition<TStep>;
  outputPath: string;
}): Promise<string> => {
  const markdown = renderFullPipelineDocumentationMarkdown(options.definition);
  await writeTextFile(options.outputPath, markdown);
  return markdown;
};
