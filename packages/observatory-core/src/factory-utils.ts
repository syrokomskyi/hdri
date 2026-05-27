/**
 * Factory-wide utility functions for hdri-factory pipeline apps.
 *
 * These utilities handle common concerns across all factory phases:
 * - Path normalization relative to factory root
 * - Common path resolution for factory apps
 */

import path from 'node:path';

/**
 * Creates a factory-relative path converter for a given app root directory.
 * The factory root is assumed to be the parent of the app root.
 *
 * @param appRootDir - The absolute path to the app root directory
 * @returns A function that converts absolute paths to factory-relative paths
 *
 * @example
 * ```typescript
 * const scriptDir = path.dirname(fileURLToPath(import.meta.url));
 * const rootDir = path.resolve(scriptDir, '..');
 * const toFactoryRelativePath = createFactoryRelativePathConverter(rootDir);
 *
 * // Now toFactoryRelativePath('/absolute/path/to/file') returns 'phase/file'
 * ```
 */
export const createFactoryRelativePathConverter = (
  appRootDir: string,
): ((absolutePath: string) => string) => {
  const factoryRootDir = path.resolve(appRootDir, '..');

  return (absolutePath: string): string => {
    let relative = path.relative(factoryRootDir, absolutePath);
    if (!relative || relative === '.') relative = '.';
    return relative.replace(/\\/g, '/');
  };
};

/**
 * Gets the factory root directory given an app root directory.
 *
 * @param appRootDir - The absolute path to the app root directory
 * @returns The absolute path to the factory root directory
 */
export const getFactoryRootDir = (appRootDir: string): string => {
  return path.resolve(appRootDir, '..');
};

/**
 * Common paths configuration for factory apps.
 * Returns the standard directory paths used across all factory phases.
 *
 * @param appRootDir - The absolute path to the app root directory
 * @param scriptDir - The absolute path to the script directory (for prompts)
 * @param deviceId - The device ID for output scoping
 * @returns Object containing standard paths
 */
export const getFactoryPaths = (
  appRootDir: string,
  scriptDir: string,
  deviceId: string,
): {
  inputDir: string;
  briefInputDir: string;
  outputRootDir: string;
  evidenceDir: string;
  promptsDir: string;
  factoryRootDir: string;
} => {
  const factoryRootDir = path.resolve(appRootDir, '..');

  return {
    inputDir: path.join(appRootDir, '..', '.input'),
    briefInputDir: path.join(appRootDir, '.input'),
    outputRootDir: path.join(appRootDir, '.output', deviceId),
    evidenceDir: path.join(appRootDir, '.evidence', deviceId),
    promptsDir: path.join(scriptDir, 'prompts'),
    factoryRootDir,
  };
};

/**
 * Gets the upstream output root directory for a given phase.
 *
 * @param factoryRootDir - The absolute path to the factory root directory
 * @param phaseName - The name of the upstream phase (e.g., '0-harvest-source')
 * @returns The absolute path to the upstream phase's output directory
 */
export const getUpstreamOutputRoot = (factoryRootDir: string, phaseName: string): string => {
  return path.join(factoryRootDir, phaseName, '.output');
};
