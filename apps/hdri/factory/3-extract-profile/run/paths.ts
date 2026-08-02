/*
<MODULE_CONTRACT>
<purpose>Provides path-utility functions for database and content storage directories used by the 3-extract-profile pipeline.</purpose>
<non-goals>
  <item>Not responsible for creating directories or managing file I/O.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import { outputRootDir } from "./config.js";

export const getDbDir = (): string => path.join(outputRootDir, "data", "db");

/**
 * Canonical name for an immutable quarter-local profile database.
 */
export const getPagesDbName = (period: string): string => `pages-${period}`;

export const getPagesDbPath = (pagesDbName: string): string => path.join(getDbDir(), `${pagesDbName}.db`);

/**
 * Root directory for CAS page content files.
 * HTML files are stored as:  data/content/{sha256[0:2]}/{sha256}.html
 */
export const getContentDir = (): string => path.join(outputRootDir, "data", "content");

/**
 * Base directory for resolving storage_path values stored in page_contents.
 * storage_path is relative to outputRootDir (e.g. "data/content/ab/ab1234....html").
 */
export const getContentRootDir = (): string => outputRootDir;

export const getContentFilePath = (sha256: string): string =>
  path.join(getContentDir(), sha256.slice(0, 2), `${sha256}.html`);

/**
 * Returns the path relative to outputRootDir — this is what gets stored in
 * page_contents.storage_path for portability.
 */
export const getContentRelativePath = (sha256: string): string =>
  `data/content/${sha256.slice(0, 2)}/${sha256}.html`;
