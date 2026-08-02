/*
<MODULE_CONTRACT>
<purpose>This module provides factory functions to generate unique identifiers for scoring and publication runs, ensuring idempotency across system restarts.</purpose>
<non-goals>
  <item>This module does not handle the storage or retrieval of generated IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of ID factories for scoring and publication runs.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha6 = (input: string): string =>
  createHash("sha256").update(input).digest("hex").slice(0, 6);

// ---------------------------------------------------------------------------
// ID factories
//
// Format: {app}-{temporal}-{sha6}
// The sha6 suffix is derived from the caller-supplied uniqueness token.
// Using a deterministic suffix means the same logical run always produces
// the same ID, which is critical for idempotency across restarts.
// ---------------------------------------------------------------------------

/**
 * hdri-scoring — one scoring run per codebook version per batch set.
 * token: hash of the upstream batch IDs + codebook version string.
 */
export const makeScoringRunId = (year: number, codebookVersion: string, token: string): string =>
  `scoring-${year}-${codebookVersion}-${sha6(token)}`;

/**
 * hdri-publication — one publication run per Jahresbericht.
 * token: hash of the scoring run ID + publication config.
 */
export const makePublicationRunId = (reportYear: string, token: string): string =>
  `pub-${reportYear}-${sha6(token)}`;
