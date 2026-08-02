/*
<MODULE_CONTRACT>
<purpose>Provides a shared factory for resolving standard pipeline app directory paths (input, output, prompts, share) from an ESM module URL, plus repo root discovery for cross-app shared data.</purpose>
<non-goals>
  <item>Does not define app-specific paths like CSV files or per-app input subdirectories.</item>
  <item>Does not perform filesystem I/O or validate that directories exist — findRepoRoot is exported separately and must be passed by the caller.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of createAppPaths factory for config.ts boilerplate elimination.</item>
  <item>Added findRepoRoot, shareInputDir, shareOutputDir, appGroup, appName to support cross-app shared data directory.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export type AppPaths = {
  scriptDir: string;
  rootDir: string;
  inputDir: string;
  outputRootDir: string;
  promptsDir: string;
  shareInputDir: string;
  shareOutputDir: string;
  appGroup: string;
  appName: string;
};

/**
 * Walks up from the current working directory until a `pnpm-workspace.yaml`
 * is found, returning the repository root path.
 *
 * This duplicates `findRepoRoot` from `@syrokomskyi/observatory-crypto` — the
 * duplication is intentional because `pipeline-node` cannot depend on
 * `observatory-crypto` (wrong domain). If a third consumer appears, extract
 * to a lower-level package like `@syrokomskyi/utils`.
 *
 * @throws if the workspace root cannot be found within 8 levels.
 */
export function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find repo root (pnpm-workspace.yaml not found within 8 levels).");
}

export type CreateAppPathsOptions = {
  /**
   * The `import.meta.url` of the calling module.
   * Pass `import.meta.url` directly.
   */
  moduleUrl: string;
  /**
   * Where to locate the prompts directory.
   * - `"input"` (default for legacy apps): `.input/prompts/`
   * - `"script"` (default): `run/prompts/`
   */
  promptsDirLocation?: "input" | "script";
  /**
   * Repository root path, typically from `findRepoRoot()`.
   * When provided, share paths are computed. When omitted,
   * share paths default to empty strings and appGroup/appName to "unknown".
   */
  repoRoot?: string;
};

export const createAppPaths = (options: CreateAppPathsOptions): AppPaths => {
  const scriptDir = path.dirname(fileURLToPath(options.moduleUrl));
  const rootDir = path.resolve(scriptDir, "..");
  const inputDir = path.join(rootDir, ".input");
  const outputRootDir = path.join(rootDir, ".output");

  const promptsDir =
    options.promptsDirLocation === "input"
      ? path.join(inputDir, "prompts")
      : path.join(scriptDir, "prompts");

  const repoRoot = options.repoRoot ?? "";
  const appsDir = repoRoot ? path.join(repoRoot, "apps") : "";
  const relativeToApps = appsDir ? path.relative(appsDir, rootDir) : "";
  const parts = relativeToApps.split(path.sep).filter(Boolean);
  const appGroup = parts.length >= 2 ? parts.slice(0, -1).join("/") : (parts[0] ?? "unknown");
  const appName = parts.length >= 1 ? parts[parts.length - 1] : "unknown";

  const shareBaseDir = appsDir ? path.join(appsDir, ".share") : "";
  const shareInputDir = shareBaseDir ? path.join(shareBaseDir, ".input") : "";
  const shareOutputDir = shareBaseDir ? path.join(shareBaseDir, ".output", appGroup, appName) : "";

  return {
    scriptDir,
    rootDir,
    inputDir,
    outputRootDir,
    promptsDir,
    shareInputDir,
    shareOutputDir,
    appGroup,
    appName,
  };
};
