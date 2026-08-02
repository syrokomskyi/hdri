/*
<MODULE_CONTRACT>
<purpose>Facilitates directory path management and source file validation for batch processing.</purpose>
<non-goals>
  <item>Do not handle file content parsing or transformation.</item>
  <item>Do not manage configuration or orchestration of batch processes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
<item>Backfill COMPASS scaffolding to enhance navigability and maintainability of path management functions.</item>
<item>Paths now resolve against the shared factory-level .input directory (via config.js).</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { inputDir, outputRootDir } from "./config.js";

export const supportedSourceExtensions = new Set([".csv", ".html", ".htm", ".mhtml"]);

// ---------------------------------------------------------------------------
// Input directories
// ---------------------------------------------------------------------------

export const getBatchesInputDir = (): string => path.join(inputDir, "batches");

export const getBatchInputDir = (batchName: string): string =>
  path.join(getBatchesInputDir(), batchName);

// ---------------------------------------------------------------------------
// Output directories
// ---------------------------------------------------------------------------

export const getDbDir = (): string => path.join(outputRootDir, "data", "db");

export const getCoreDbPath = (year: number): string => path.join(getDbDir(), `core_${year}.db`);

export const getBatchDataDir = (batchName: string): string =>
  path.join(outputRootDir, "data", "batches", batchName);

// ---------------------------------------------------------------------------
// Path helpers for source files
// ---------------------------------------------------------------------------

export const isSupportedSourceFile = (filePath: string): boolean =>
  supportedSourceExtensions.has(path.extname(filePath).toLowerCase());

export const getLogicalSourcePath = (batchName: string, filePath: string): string =>
  path.relative(getBatchInputDir(batchName), filePath).replace(/\\/g, "/");

export const getBatchScopedSourcePath = (batchName: string, filePath: string): string =>
  `${batchName}/${getLogicalSourcePath(batchName, filePath)}`;

export const shouldExcludeSourcePath = (
  batchScopedSourcePath: string,
  excludePatterns: string[],
): boolean =>
  excludePatterns.some((pattern) => new RegExp(pattern, "u").test(batchScopedSourcePath));
