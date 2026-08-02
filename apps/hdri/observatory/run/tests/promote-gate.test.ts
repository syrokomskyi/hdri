/**
 * WP8 publication gate — proves the shared validate core behaves correctly when a
 * staging candidate is validated as if promoted. This is the check that stands
 * between a finished run and the canonical, dashboard-facing DB.
 *
 *  - published-only validation ignores candidate defects (candidate is not yet live);
 *  - candidate validation (candidateRunIds) DOES catch the candidate's structural
 *    defects — the gate that blocks promotion;
 *  - a candidate for a NEW period passes one-published-per-period;
 *  - a candidate re-publishing an EXISTING period does NOT false-positive, because
 *    the prior published run of that period is treated as superseded (what promote does).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId, deriveAssetId } from "@syrokomskyi/observatory-core";
import { migrateObservatory } from "../db/migrate";
import { collectFindings } from "../../tools/validate-core";

let dbPath: string;
let db: Database.Database;

const Q2_RUN = "run-q2";
const Q3_CAND = "run-q3-candidate";

const insertRun = (
  runId: string,
  period: string,
  pub: "published" | "candidate",
  status = "finished",
): void => {
  db.prepare(
    `INSERT INTO pipeline_runs
       (run_id, pipeline_app, pipeline_version, period, ontology_version, codebook_version, started_at, finished_at, status, publication_status)
     VALUES (?, 'observatory', 'v1.0', ?, '1.0.0', '1.3.0', '2026-07-01T00:00:00Z', '2026-07-01T02:00:00Z', ?, ?)`,
  ).run(runId, period, status, pub);
};

const insertScoredAsset = (runId: string, period: string, assetId: string, score: number): void => {
  db.prepare(
    `INSERT INTO scores
       (id, asset_id, codebook_id, codebook_version, overall_score, confidence, computation_hash, run_id, scored_at, period)
     VALUES (?, ?, 'observatory-v1', '1.3.0', ?, 1, 'h', ?, '2026-07-01T02:00:00Z', ?)`,
  ).run(newId(), assetId, score, runId, period);
  db.prepare(
    `INSERT INTO asset_states
       (asset_id, domain, valid_from, run_id, period)
     VALUES (?, ?, '2026-07-01T00:00:00Z', ?, ?)`,
  ).run(assetId, `${assetId}.de`, runId, period);
};

beforeAll(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "obs-gate-")), "observatory_2026.db");
  db = new Database(dbPath);
  migrateObservatory(db);

  // Q2 published + Q3 candidate (finished, not yet published).
  insertRun(Q2_RUN, "2026-q2", "published");
  insertRun(Q3_CAND, "2026-q3", "candidate");
  for (let i = 0; i < 10; i++)
    insertScoredAsset(Q2_RUN, "2026-q2", deriveAssetId(`q2-${i}.de`), 50);
  for (let i = 0; i < 10; i++)
    insertScoredAsset(Q3_CAND, "2026-q3", deriveAssetId(`q3-${i}.de`), 60);
});

afterAll(() => {
  db.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

const errorChecks = (opts?: { candidateRunIds?: string[] }): string[] =>
  collectFindings(dbPath, opts)
    .filter((f) => f.severity === "ERROR")
    .map((f) => f.check);

describe("WP8 publication gate", () => {
  it("published-only validation ignores the candidate entirely", () => {
    const findings = collectFindings(dbPath);
    // Only Q2 is snapshotted; Q3 candidate is invisible until treated as published.
    const snapshots = findings.filter((f) => f.check === "period-snapshot");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.message).toContain("2026-q2");
    expect(errorChecks()).toEqual([]);
  });

  it("candidate for a new period passes the gate (one published per period holds)", () => {
    const findings = collectFindings(dbPath, { candidateRunIds: [Q3_CAND] });
    const snapshots = findings.filter((f) => f.check === "period-snapshot");
    expect(snapshots.map((s) => s.message.slice(0, 7)).sort()).toEqual(["2026-q2", "2026-q3"]);
    expect(errorChecks({ candidateRunIds: [Q3_CAND] })).toEqual([]);
  });

  it("catches a structural defect in the candidate that published-only validation misses", () => {
    // Inject a second asset_states row for a candidate asset (a different valid_from
    // is permitted by the PK) → the export INNER JOIN would fan out and over-count.
    const fanAsset = deriveAssetId("q3-0.de");
    db.prepare(
      `INSERT INTO asset_states
         (asset_id, domain, valid_from, run_id, period)
       VALUES (?, ?, '2026-08-01T00:00:00Z', ?, '2026-q3')`,
    ).run(fanAsset, `${fanAsset}.de`, Q3_CAND);

    // Published-only: clean (candidate not considered).
    expect(errorChecks()).toEqual([]);
    // Gate: the candidate's fan-out is caught → promotion must be blocked.
    expect(errorChecks({ candidateRunIds: [Q3_CAND] })).toContain("asset-state-fanout");

    // Clean up so later assertions are unaffected.
    db.prepare(
      `DELETE FROM asset_states WHERE asset_id = ? AND valid_from = '2026-08-01T00:00:00Z'`,
    ).run(fanAsset);
  });

  it("flags a same-version methodology_hash change as a content-drift comparability break", () => {
    // Q2 and Q3 declare identical codebook/ontology versions (1.3.0 / 1.0.0), so the
    // version-string drift checks stay silent — but their frozen methodology_hash differs,
    // meaning the codebook/ontology CONTENT changed without a version bump.
    const insertMeth = (runId: string, hash: string): void => {
      db.prepare(
        `INSERT INTO run_methodology
           (run_id, codebook_id, codebook_version, ontology_version, scorer_version,
            codebook_sha256, ontology_sha256, methodology_hash, frozen_at)
         VALUES (?, 'observatory-v1', '1.3.0', '1.0.0', '1.3.0', 'cb', 'on', ?, '2026-07-01T00:00:00Z')`,
      ).run(runId, hash);
    };
    insertMeth(Q2_RUN, "hash-q2-aaaaaaaaaaaa");
    insertMeth(Q3_CAND, "hash-q3-bbbbbbbbbbbb");

    const warns = collectFindings(dbPath, { candidateRunIds: [Q3_CAND] })
      .filter((f) => f.severity === "WARN")
      .map((f) => f.check);
    expect(warns).toContain("methodology-content-drift");
    // The version-string drift checks must NOT fire — versions are identical.
    expect(warns).not.toContain("codebook-version-drift");
    expect(warns).not.toContain("ontology-version-drift");

    db.prepare(`DELETE FROM run_methodology WHERE run_id IN (?, ?)`).run(Q2_RUN, Q3_CAND);
  });

  it("re-publishing an existing period does not false-positive on one-per-period", () => {
    // A fresh Q2 candidate while Q2 is already published: promotion supersedes the
    // old one, so the gate must treat the period as having exactly one published run.
    const q2Redo = "run-q2-redo";
    insertRun(q2Redo, "2026-q2", "candidate");
    for (let i = 0; i < 10; i++)
      insertScoredAsset(q2Redo, "2026-q2", deriveAssetId(`q2r-${i}.de`), 55);

    expect(errorChecks({ candidateRunIds: [q2Redo] })).toEqual([]);

    const snapshots = collectFindings(dbPath, { candidateRunIds: [q2Redo] }).filter(
      (f) => f.check === "period-snapshot",
    );
    // Q2 snapshot reflects the NEW candidate run, not the old published one.
    const q2Snap = snapshots.find((s) => s.message.startsWith("2026-q2"))!;
    expect(q2Snap.message).toContain(q2Redo.slice(0, 8));

    db.prepare(`DELETE FROM pipeline_runs WHERE run_id = ?`).run(q2Redo);
  });
});
