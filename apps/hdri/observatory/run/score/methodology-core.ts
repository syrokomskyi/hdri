/*
<MODULE_CONTRACT>
<purpose>Pure computation + immutable persistence of a run's methodology fingerprint (WP12):
the codebook + ontology + scorer version and their content hashes, frozen so a published run
is reproducible and tamper-evident.</purpose>
<non-goals>
  <item>Does not read the codebook/ontology or open DBs — the caller supplies sources and the connection.</item>
  <item>Does not enforce cross-quarter comparability — that is validate-core's job (it reads these rows).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP12: freeze codebook/ontology/scorer version into each run's record for reproducibility.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import type Database from "better-sqlite3";
import { sha256, sha256Json } from "@syrokomskyi/observatory-core";

export type MethodologyFingerprint = {
  codebookId: string;
  codebookVersion: string;
  ontologyVersion: string;
  /** Scoring-engine (@syrokomskyi/hdri-codebook) package version. */
  scorerVersion: string;
  /** SHA-256 of the exact codebook source that scored the run. */
  codebookSha256: string;
  /** SHA-256 of the exact ontology source, or null in legacy (no-ontology) mode. */
  ontologySha256: string | null;
  /** Stable hash over all of the above — the single methodology identity for the run. */
  methodologyHash: string;
};

export type MethodologyInput = {
  codebookId: string;
  codebookVersion: string;
  ontologyVersion: string;
  scorerVersion: string;
  /** Raw codebook.yaml text (hashed verbatim). */
  codebookSource: string;
  /** Raw ontology.yaml text, or null when the codebook declares no ontologyRef. */
  ontologySource: string | null;
};

/**
 * Computes the methodology fingerprint. The `methodology_hash` folds versions AND content
 * hashes, so two runs share it only if they scored with byte-identical codebook + ontology
 * under the same scorer — the precise condition for cross-quarter score comparability.
 */
export function computeMethodologyFingerprint(input: MethodologyInput): MethodologyFingerprint {
  const codebookSha256 = sha256(input.codebookSource);
  const ontologySha256 = input.ontologySource != null ? sha256(input.ontologySource) : null;
  const methodologyHash = sha256Json({
    codebookId: input.codebookId,
    codebookVersion: input.codebookVersion,
    ontologyVersion: input.ontologyVersion,
    scorerVersion: input.scorerVersion,
    codebookSha256,
    ontologySha256,
  });
  return {
    codebookId: input.codebookId,
    codebookVersion: input.codebookVersion,
    ontologyVersion: input.ontologyVersion,
    scorerVersion: input.scorerVersion,
    codebookSha256,
    ontologySha256,
    methodologyHash,
  };
}

/**
 * Freezes the methodology fingerprint for a run. INSERT OR IGNORE: a run's methodology is
 * immutable once written — re-running the same run_id (e.g. an idempotent re-score) never
 * overwrites the frozen record. Returns true if a new record was written.
 *
 * `frameSha256` (WP15) records the population-frame content that fed the run's published
 * post-stratified numbers, when a frame was present. It is stored but deliberately NOT part of
 * `methodology_hash`, whose identity is the SCORING methodology (codebook + ontology + scorer).
 */
export function writeRunMethodology(
  db: Database.Database,
  runId: string,
  fp: MethodologyFingerprint,
  frozenAt: string,
  frameSha256: string | null = null,
): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO run_methodology
         (run_id, codebook_id, codebook_version, ontology_version, scorer_version,
          codebook_sha256, ontology_sha256, methodology_hash, frozen_at, frame_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      runId,
      fp.codebookId,
      fp.codebookVersion,
      fp.ontologyVersion,
      fp.scorerVersion,
      fp.codebookSha256,
      fp.ontologySha256,
      fp.methodologyHash,
      frozenAt,
      frameSha256,
    );
  return res.changes > 0;
}
