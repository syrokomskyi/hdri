import path from "node:path";

import Handlebars from "handlebars";

import { readTextFile, writeTextFile } from "./create-node-pipeline-fs.js";

export type TemplateVars = Record<string, unknown>;

export type WriteTemplateFileOptions = {
  artifactRelativePath: string;
  ownerId: string;
  outputPath: string;
  transformOutput?: (content: string) => Promise<string> | string;
  vars?: TemplateVars;
};

export type CreateTemplateArtifactWriterOptions = {
  defaultTransformOutput?: (content: string) => Promise<string> | string;
  templatesDir: string;
  readTextFile?: (filePath: string) => Promise<string>;
  writeTextFile?: (filePath: string, content: string) => Promise<void>;
};

export type TemplateArtifactWriter = (
  options: WriteTemplateFileOptions,
) => Promise<string>;

export type HandlebarsTemplateRenderer = {
  readTemplateFile: (ownerId: string, artifactRelativePath: string) => Promise<string>;
  renderTemplate: (
    ownerId: string,
    artifactRelativePath: string,
    vars?: TemplateVars,
  ) => Promise<string>;
  writeTemplateFile: (options: WriteTemplateFileOptions) => Promise<string>;
};

export type CreateHandlebarsTemplateRendererOptions = {
  templatesDir: string;
  readTextFile?: (filePath: string) => Promise<string>;
  writeTextFile?: (filePath: string, content: string) => Promise<void>;
};

export type WriteTemplateArtifactsIfMissingOptions = {
  artifacts: Array<{
    artifactRelativePath: string;
    branded?: boolean;
    outputPath: string;
    vars?: TemplateVars;
  }>;
  ensureOutputDir: (dirPath: string) => Promise<void>;
  fileExists: (filePath: string) => Promise<boolean>;
  ownerId: string;
  outputDir: string;
  skipIfExistsPath: string;
  writeTemplateArtifact: TemplateArtifactWriter;
  writeBrandedTemplateArtifact?: TemplateArtifactWriter;
};

const templateCache = new Map<
  string,
  Handlebars.TemplateDelegate<TemplateVars>
>();

Handlebars.registerHelper("json", (value: unknown) => JSON.stringify(value, null, 2));

export const createHandlebarsTemplateRenderer = (
  options: CreateHandlebarsTemplateRendererOptions,
): HandlebarsTemplateRenderer => {
  const readText = options.readTextFile ?? readTextFile;
  const writeText = options.writeTextFile ?? writeTextFile;

  return {
    readTemplateFile: async (ownerId, artifactRelativePath) => {
      const templatePath = path.join(
        options.templatesDir,
        ownerId,
        `${artifactRelativePath}.hbs`,
      );
      return readText(templatePath);
    },
    renderTemplate: async (ownerId, artifactRelativePath, vars = {}) => {
      const cacheKey = `${ownerId}/${artifactRelativePath}`;
      const cached = templateCache.get(cacheKey);
      if (cached) {
        return cached(vars).trimEnd();
      }

      const templatePath = path.join(
        options.templatesDir,
        ownerId,
        `${artifactRelativePath}.hbs`,
      );
      const templateText = await readText(templatePath);
      const compiled = Handlebars.compile(templateText, { noEscape: true });
      templateCache.set(cacheKey, compiled);
      return compiled(vars).trimEnd();
    },
    writeTemplateFile: async ({
      artifactRelativePath,
      ownerId,
      outputPath,
      transformOutput,
      vars = {},
    }) => {
      const rendered = await readText(
        path.join(options.templatesDir, ownerId, `${artifactRelativePath}.hbs`),
      ).then((templateText) => {
        const cacheKey = `${ownerId}/${artifactRelativePath}`;
        const cached = templateCache.get(cacheKey);
        if (cached) {
          return cached(vars).trimEnd();
        }

        const compiled = Handlebars.compile(templateText, { noEscape: true });
        templateCache.set(cacheKey, compiled);
        return compiled(vars).trimEnd();
      });
      const finalContent = transformOutput ? await transformOutput(rendered) : rendered;
      await writeText(outputPath, finalContent);
      return finalContent;
    },
  };
};

export const createTemplateArtifactWriter = (
  options: CreateTemplateArtifactWriterOptions,
): TemplateArtifactWriter => {
  const renderer = createHandlebarsTemplateRenderer({
    templatesDir: options.templatesDir,
    ...(options.readTextFile ? { readTextFile: options.readTextFile } : {}),
    ...(options.writeTextFile ? { writeTextFile: options.writeTextFile } : {}),
  });

  return async (writeOptions) => {
    return renderer.writeTemplateFile({
      ...writeOptions,
      transformOutput: writeOptions.transformOutput ?? options.defaultTransformOutput,
    });
  };
};

export const writeTemplateArtifactsIfMissing = async (
  options: WriteTemplateArtifactsIfMissingOptions,
): Promise<boolean> => {
  if (await options.fileExists(options.skipIfExistsPath)) {
    return false;
  }

  await options.ensureOutputDir(options.outputDir);

  for (const artifact of options.artifacts) {
    if (artifact.branded) {
      const writeBrandedTemplateArtifact = options.writeBrandedTemplateArtifact;
      if (!writeBrandedTemplateArtifact) {
        throw new Error(
          `Missing branded template writer for ${options.ownerId}/${artifact.artifactRelativePath}`,
        );
      }

      await writeBrandedTemplateArtifact({
        ownerId: options.ownerId,
        artifactRelativePath: artifact.artifactRelativePath,
        outputPath: artifact.outputPath,
        vars: artifact.vars,
      });
      continue;
    }

    await options.writeTemplateArtifact({
      ownerId: options.ownerId,
      artifactRelativePath: artifact.artifactRelativePath,
      outputPath: artifact.outputPath,
      vars: artifact.vars,
    });
  }

  return true;
};
