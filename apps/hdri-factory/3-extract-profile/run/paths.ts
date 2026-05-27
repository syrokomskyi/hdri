/*
<MODULE_CONTRACT>
<purpose>Provides path-utility functions for database and content storage directories used by the 3-extract-profile pipeline.</purpose>
<keywords>paths, database, content storage, filesystem</keywords>
<responsibilities>
  <item>Resolve paths for the pages SQLite database (year and half segmented).</item>
  <item>Resolve paths for CAS page content storage (sharded by SHA-256 prefix).</item>
  <item>Provide relative storage paths for portability in page_contents table.</item>
</responsibilities>
<non-goals>
  <item>Not responsible for creating directories or managing file I/O.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="getDbDir">Returns the database output directory path.</entry>
  <entry key="getPagesDbName">Returns the canonical pages DB name derived from year and half.</entry>
  <entry key="getPagesDbPath">Returns the full path to a pages DB file.</entry>
  <entry key="getContentDir">Returns the root directory for CAS page content files.</entry>
  <entry key="getContentRootDir">Returns the base directory for resolving storage_path values.</entry>
  <entry key="getContentFilePath">Resolves the full filesystem path for a content file by SHA-256.</entry>
  <entry key="getContentRelativePath">Returns the relative storage path (relative to outputRootDir) for a content file.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from 'node:path';
import { outputRootDir } from './config.js';

export const getDbDir = (): string => path.join(outputRootDir, 'data', 'db');

/**
 * Canonical name for the pages DB derived from profile year and half.
 * E.g. "pages-2026-h1" → file "pages-2026-h1.db"
 */
export const getPagesDbName = (year: number, half: 1 | 2): string =>
  `pages-${year}-h${half}`;

export const getPagesDbPath = (year: number, half: 1 | 2): string =>
  path.join(getDbDir(), `${getPagesDbName(year, half)}.db`);

/**
 * Root directory for CAS page content files.
 * HTML files are stored as:  data/content/{sha256[0:2]}/{sha256}.html
 */
export const getContentDir = (): string => path.join(outputRootDir, 'data', 'content');

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

