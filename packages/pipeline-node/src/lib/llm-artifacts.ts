export type LlmArtifactWriter = (outputPath: string, content: string) => Promise<string>;

export type LlmArtifactDescriptor = {
  outputPath: string;
  branded?: boolean;
  generate: () => Promise<string>;
};

export type WriteLlmArtifactsIfMissingOptions = {
  artifacts: LlmArtifactDescriptor[];
  ensureOutputDir: (dirPath: string) => Promise<void>;
  fileExists: (filePath: string) => Promise<boolean>;
  outputDir: string;
  skipIfExistsPath: string;
  writeLlmArtifact: LlmArtifactWriter;
  writeBrandedLlmArtifact?: LlmArtifactWriter;
};

/**
 * LLM analog of writeTemplateArtifactsIfMissing.
 * Returns false when skipIfExistsPath already exists (cache hit),
 * or an array of written content strings (one per artifact) when generated.
 */
export const writeLlmArtifactsIfMissing = async (
  options: WriteLlmArtifactsIfMissingOptions,
): Promise<string[] | false> => {
  if (await options.fileExists(options.skipIfExistsPath)) {
    return false;
  }

  await options.ensureOutputDir(options.outputDir);

  const results: string[] = [];

  for (const artifact of options.artifacts) {
    const content = await artifact.generate();

    if (artifact.branded) {
      if (!options.writeBrandedLlmArtifact) {
        throw new Error(`Missing branded LLM writer for ${artifact.outputPath}`);
      }
      results.push(await options.writeBrandedLlmArtifact(artifact.outputPath, content));
    } else {
      results.push(await options.writeLlmArtifact(artifact.outputPath, content));
    }
  }

  return results;
};
