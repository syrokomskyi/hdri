/* 
<MODULE_CONTRACT> 
<purpose>Facilitates the retrieval and organization of batch-related source files within a specified directory structure.</purpose> 
 
 
<non-goals> 
  <item>Do not handle file content parsing or transformation.</item> 
  <item>Do not manage batch creation or deletion processes.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Added COMPASS scaffolding to clarify module purpose, responsibilities, and boundaries.</item>
  <item>Remove incorrect file-level maxCountSitePerSourceFolder filter; site-per-folder limit now enforced downstream in ParseSourcesGogol.</item>
  <item>Add sourceFolder field to BatchSourceFile so the folder limit correctly targets the top-level source directory inside a batch.</item>
  <item>Expose sorted batch discovery so preserved inputs can rebuild the cumulative frame.</item>
  <item>Remove obsolete CHANGE_SUMMARY item referencing deleted maxCountSitePerSourceFolder field.</item>
</CHANGE_SUMMARY> 
*/

import path from "node:path";
import fs from "node:fs/promises";
import type { Brief } from "./brief.js";
import {
  getBatchInputDir,
  getBatchScopedSourcePath,
  getBatchesInputDir,
  getLogicalSourcePath,
  isSupportedSourceFile,
  shouldExcludeSourcePath,
} from "./paths.js";

export type BatchSourceFile = {
  absolutePath: string;
  batchName: string;
  batchScopedPath: string;
  logicalPath: string;
  parserScopeKey: string;
  relativeDir: string;
  /** Top-level folder inside the batch (the source/"origin" folder). */
  sourceFolder: string;
  extension: string;
};

const walkFiles = async (dirPath: string): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath);
      return entry.isFile() ? [fullPath] : [];
    }),
  );

  return nested.flat();
};

export const listBatchNames = async (): Promise<string[]> => {
  const batchesDir = getBatchesInputDir();
  const entries = await fs.readdir(batchesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

export const listBatchSourceFiles = async (
  batchName: string,
  brief: Brief,
): Promise<BatchSourceFile[]> => {
  const batchDir = getBatchInputDir(batchName);
  const allFiles = await walkFiles(batchDir);

  return allFiles
    .filter((filePath) => isSupportedSourceFile(filePath))
    .map((filePath) => {
      const logicalPath = getLogicalSourcePath(batchName, filePath);
      const batchScopedPath = getBatchScopedSourcePath(batchName, filePath);
      const posixLogical = logicalPath.replace(/\\/g, "/");
      const relativeDir = path.posix.dirname(posixLogical);
      const parserScopeKey = relativeDir === "." ? "__batch_root__" : relativeDir;
      const sourceFolder = posixLogical.includes("/")
        ? posixLogical.split("/")[0]
        : "__batch_root__";

      return {
        absolutePath: filePath,
        batchName,
        batchScopedPath,
        logicalPath,
        parserScopeKey,
        relativeDir,
        sourceFolder,
        extension: path.extname(filePath).toLowerCase(),
      } satisfies BatchSourceFile;
    })
    .filter((file) => !shouldExcludeSourcePath(file.batchScopedPath, brief.exclude))
    .sort((a, b) => a.batchScopedPath.localeCompare(b.batchScopedPath));
};
