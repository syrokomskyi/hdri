/*
<MODULE_CONTRACT>
<purpose>Reusable integrity & cross-quarter comparability checks over an observatory SQLite DB.</purpose>
<non-goals>
  <item>Does not modify any database, recompute scores, or enforce statistical methodology.</item>
  <item>Does not print or set process.exitCode — callers own I/O and exit semantics.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP8: extracted from validate-observatory.ts so staging promotion reuses the identical gate.</item>
  <item>Finding 8: added cross-period data-quality drift checks (score distribution, sample size,
        dead-domain share) via quality-drift-core, with an allowDrift acknowledgement path.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import Database from "better-sqlite3";
import { computePeriodQuality, driftFindings, type PeriodQuality } from "./quality-drift-core";

export type Severity = "ERROR" | "WARN" | "INFO";

export type Finding = {
  severity: Severity;
  db: string;
  check: string;
  message: string;
};

export type CollectOptions = {
  /**
   * Runs to validate as if they were the published run for their period. The
   * currently-published run of the same period (if any) is treated as superseded,
   * mirroring exactly what `promote-to-canonical` will do — so the gate reflects
   * the post-promotion state, not the pre-promotion one.
   */
  candidateRunIds?: string[];
  /**
   * When a data-quality drift is a confirmed real-world change (not a broken build), an
   * operator sets this to downgrade drift ERRORs to WARN so publication is not blocked.
   * The drift finding is still reported — it is acknowledged, not hidden.
   */
  allowDrift?: boolean;
};

type PublishedRun = {
  run_id: string;
  period: string;
  codebook_version: string;
  ontology_version: string;
  /** Authoritative scoring codebook version, read from the scores table. */
  scoring_codebook_version?: string;
  /** Frozen methodology hash from run_methodology (WP12), if present. */
  methodology_hash?: string;
};

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name),
  );
}

/**
 * Runs the full check suite against a single observatory DB and returns findings.
 * Read-only: opens the DB in readonly mode and never mutates it.
 */
export function collectFindings(dbPath: string, opts: CollectOptions = {}): Finding[] {
  const dbName = path.basename(dbPath);
  const findings: Finding[] = [];
  const add = (severity: Severity, check: string, message: string): void => {
    findings.push({ severity, db: dbName, check, message });
  };

  const candidateRunIds = opts.candidateRunIds ?? [];
  const db = new Database(dbPath, { readonly: true });
  try {
    // ── Effective published set ───────────────────────────────────────────────
    // Candidate runs are validated as if promoted; any currently-published run of
    // the SAME period is excluded (promotion supersedes it). This makes the gate
    // reflect the post-promotion state exactly.
    const candidateRows =
      candidateRunIds.length > 0
        ? (db
            .prepare(
              `SELECT run_id, period, codebook_version, ontology_version
               FROM pipeline_runs
               WHERE run_id IN (${candidateRunIds.map(() => "?").join(", ")})`,
            )
            .all(...candidateRunIds) as PublishedRun[])
        : [];
    const candidatePeriods = new Set(candidateRows.map((r) => r.period));

    const currentlyPublished = db
      .prepare(
        `SELECT run_id, period, codebook_version, ontology_version
         FROM pipeline_runs
         WHERE status = 'finished' AND publication_status = 'published'`,
      )
      .all() as PublishedRun[];

    const publishedRuns = [
      ...currentlyPublished.filter((r) => !candidatePeriods.has(r.period)),
      ...candidateRows,
    ].sort((a, b) => a.period.localeCompare(b.period));

    // ── Published runs, one per period ────────────────────────────────────────
    const perPeriod = new Map<string, number>();
    for (const r of publishedRuns) perPeriod.set(r.period, (perPeriod.get(r.period) ?? 0) + 1);

    if (publishedRuns.length === 0) {
      add("WARN", "published-runs", "no published runs found — dashboard export will be empty");
    }
    for (const [period, n] of [...perPeriod.entries()].sort()) {
      if (n !== 1) {
        add(
          "ERROR",
          "one-published-per-period",
          `period ${period} has ${n} published runs — export requires exactly 1 (ensureUniquePeriods will throw)`,
        );
      }
    }

    // ── Per published run structural checks ───────────────────────────────────
    for (const run of publishedRuns) {
      // pipeline_runs.codebook_version is updated to the real scoring version by
      // ScoreHdriGogol after scoring. Cross-quarter comparability keys off the
      // authoritative version in scores. The WARN fires only for legacy runs that
      // were not updated (pre-variant-A) or if scoring was skipped.
      const scoringVersions = db
        .prepare(`SELECT DISTINCT codebook_version FROM scores WHERE run_id = ?`)
        .all(run.run_id) as Array<{ codebook_version: string }>;
      if (scoringVersions.length > 1) {
        add(
          "ERROR",
          "mixed-scoring-versions",
          `period ${run.period}: scores in one run use multiple codebook versions [${scoringVersions.map((v) => v.codebook_version).join(", ")}] — a run must score with one version`,
        );
      }
      run.scoring_codebook_version = scoringVersions[0]?.codebook_version;
      if (run.scoring_codebook_version && run.scoring_codebook_version !== run.codebook_version) {
        add(
          "WARN",
          "codebook-version-metadata-mismatch",
          `period ${run.period}: pipeline_runs.codebook_version="${run.codebook_version}" but scores were computed with "${run.scoring_codebook_version}" — the dashboard displays the misleading run-level value`,
        );
      }

      // Duplicate scores per (run_id, asset_id) → double counting in aggregates.
      const dupScores = db
        .prepare(
          `SELECT COUNT(*) AS groups FROM
             (SELECT asset_id FROM scores WHERE run_id = ? GROUP BY asset_id HAVING COUNT(*) > 1)`,
        )
        .get(run.run_id) as { groups: number };
      if (dupScores.groups > 0) {
        add(
          "ERROR",
          "score-duplicates",
          `period ${run.period}: ${dupScores.groups} asset(s) have >1 score row in published run ${run.run_id.slice(0, 8)} — aggregates double-count them`,
        );
      }

      // asset_states fan-out per (asset_id, run_id) → export INNER JOIN inflates rows.
      const fanout = db
        .prepare(
          `SELECT COUNT(*) AS groups FROM
             (SELECT asset_id FROM asset_states WHERE run_id = ? GROUP BY asset_id HAVING COUNT(*) > 1)`,
        )
        .get(run.run_id) as { groups: number };
      if (fanout.groups > 0) {
        add(
          "ERROR",
          "asset-state-fanout",
          `period ${run.period}: ${fanout.groups} asset(s) have >1 asset_states row in published run ${run.run_id.slice(0, 8)} — export JOIN fans out and over-counts`,
        );
      }

      // Orphan scores: scored asset with no asset_states row for the same run.
      // The export uses an INNER JOIN on (asset_id, run_id), so these silently drop from N.
      const orphans = db
        .prepare(
          `SELECT COUNT(*) AS n FROM scores s
           WHERE s.run_id = ?
             AND s.overall_score IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM asset_states a WHERE a.asset_id = s.asset_id AND a.run_id = s.run_id
             )`,
        )
        .get(run.run_id) as { n: number };
      if (orphans.n > 0) {
        add(
          "WARN",
          "orphan-scores",
          `period ${run.period}: ${orphans.n} scored asset(s) lack an asset_states row for the run — export drops them from the published N`,
        );
      }

      // Frozen methodology provenance (WP12): a published run must carry the exact
      // codebook/ontology/scorer it was scored with, else it is not reproducible.
      if (tableExists(db, "run_methodology")) {
        const meth = db
          .prepare(`SELECT methodology_hash FROM run_methodology WHERE run_id = ?`)
          .get(run.run_id) as { methodology_hash: string } | undefined;
        if (!meth) {
          add(
            "WARN",
            "no-methodology-record",
            `period ${run.period}: published run ${run.run_id.slice(0, 8)} has no frozen methodology record (run_methodology) — its scores are not reproducibly provenanced`,
          );
        } else {
          run.methodology_hash = meth.methodology_hash;
        }
      }

      // Snapshot (INFO) — the numbers to compare before/after any change.
      const counts = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM scores WHERE run_id = @r) AS scores,
             (SELECT COUNT(*) FROM scores WHERE run_id = @r AND overall_score IS NOT NULL) AS nonnull,
             (SELECT COUNT(*) FROM asset_states WHERE run_id = @r) AS asset_states`,
        )
        .get({ r: run.run_id }) as { scores: number; nonnull: number; asset_states: number };

      add(
        "INFO",
        "period-snapshot",
        `${run.period}: run=${run.run_id.slice(0, 8)} scores=${counts.scores} nonnull=${counts.nonnull} asset_states=${counts.asset_states} codebook=${run.scoring_codebook_version ?? run.codebook_version} ontology=${run.ontology_version}` +
          (run.methodology_hash ? ` methodology=${run.methodology_hash.slice(0, 12)}` : ""),
      );
    }

    // ── Cross-quarter comparability: adjacent published periods must share versions ─
    for (let i = 1; i < publishedRuns.length; i++) {
      const prev = publishedRuns[i - 1]!;
      const cur = publishedRuns[i]!;
      const prevCb = prev.scoring_codebook_version ?? prev.codebook_version;
      const curCb = cur.scoring_codebook_version ?? cur.codebook_version;
      if (prevCb !== curCb) {
        add(
          "WARN",
          "codebook-version-drift",
          `${prev.period} (codebook ${prevCb}) → ${cur.period} (codebook ${curCb}): scores are NOT comparable; cross-quarter deltas would be invalid`,
        );
      }
      if (prev.ontology_version !== cur.ontology_version) {
        add(
          "WARN",
          "ontology-version-drift",
          `${prev.period} (ontology ${prev.ontology_version}) → ${cur.period} (ontology ${cur.ontology_version}): signal definitions changed; deltas may be invalid`,
        );
      }

      // Content-level comparability (WP12 methodology_hash). The version-string checks above
      // miss the sneaky case: a codebook or ontology whose CONTENT changed while its declared
      // version stayed the same. The frozen methodology_hash folds content hashes, so when both
      // periods carry one and it differs WITHOUT a version bump, the scores are silently not
      // comparable — a break the version checks cannot see. Only flagged here (not double-
      // reported) when the versions match, so it is strictly additional coverage.
      if (
        prev.methodology_hash &&
        cur.methodology_hash &&
        prev.methodology_hash !== cur.methodology_hash &&
        prevCb === curCb &&
        prev.ontology_version === cur.ontology_version
      ) {
        add(
          "WARN",
          "methodology-content-drift",
          `${prev.period} → ${cur.period}: codebook/ontology versions match but methodology_hash changed ` +
            `(${prev.methodology_hash.slice(0, 12)} → ${cur.methodology_hash.slice(0, 12)}) — the scoring ` +
            `CONTENT changed without a version bump; cross-quarter deltas are NOT comparable`,
        );
      }
    }

    // ── Data-quality drift across published periods (finding 8) ───────────────
    // Catch a silently broken build: an unexplained score-distribution shift, a collapse
    // in the scored sample, or a dead-domain spike between quarters. Score drift is judged
    // only across a comparable methodology boundary; N and dead-share always apply.
    const quality: PeriodQuality[] = publishedRuns.map((run) =>
      computePeriodQuality(db, {
        run_id: run.run_id,
        period: run.period,
        comparabilityKey:
          run.methodology_hash ?? run.scoring_codebook_version ?? run.codebook_version ?? null,
      }),
    );
    for (const d of driftFindings(quality)) {
      const severity: Severity = d.severity === "ERROR" && opts.allowDrift ? "WARN" : d.severity;
      const suffix =
        d.severity === "ERROR" && opts.allowDrift ? " [acknowledged via --allow-drift]" : "";
      add(severity, d.check, d.message + suffix);
    }

    // ── Signing / vault readiness (INFO) ──────────────────────────────────────
    if (tableExists(db, "observations")) {
      const sig = db
        .prepare(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN signature IS NOT NULL THEN 1 ELSE 0 END) AS signed
           FROM observations`,
        )
        .get() as { total: number; signed: number | null };
      const signed = sig.signed ?? 0;
      if (sig.total > 0 && signed < sig.total) {
        add(
          "WARN",
          "signing-coverage",
          `${signed}/${sig.total} observations signed — unsigned rows cannot be written to / verified in the vault`,
        );
      } else if (sig.total > 0) {
        add("INFO", "signing-coverage", `${signed}/${sig.total} observations signed`);
      }
    }
  } finally {
    db.close();
  }

  return findings;
}

/** Renders findings into a console report and returns the error/warn counts. */
export function formatReport(findings: Finding[]): { text: string; errors: number; warns: number } {
  const lines: string[] = [];
  const order: Severity[] = ["ERROR", "WARN", "INFO"];
  for (const sev of order) {
    const items = findings.filter((f) => f.severity === sev);
    if (items.length === 0) continue;
    const icon = sev === "ERROR" ? "❌" : sev === "WARN" ? "⚠️ " : "ℹ️ ";
    lines.push(`\n${icon} ${sev} (${items.length})`);
    for (const f of items) {
      lines.push(`  [${f.db}] ${f.check}: ${f.message}`);
    }
  }
  const errors = findings.filter((f) => f.severity === "ERROR").length;
  const warns = findings.filter((f) => f.severity === "WARN").length;
  return { text: lines.join("\n"), errors, warns };
}
