import type Database from 'better-sqlite3';

/**
 * Idempotent DDL migration for hdri-scores.db.
 * Owned by hdri-scoring; stores per-run scores, dimension breakdowns,
 * and per-indicator audit traces. Also hosts pipeline_inputs for
 * cross-pipeline provenance.
 */
export const migrateScores = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      owner_app      TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      built_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Per-site overall score
    CREATE TABLE IF NOT EXISTS scores (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      scoring_run_id   TEXT NOT NULL,
      site_id          INTEGER NOT NULL,
      cohort_id        TEXT,
      overall_score    REAL,
      confidence       REAL,
      codebook_id      TEXT NOT NULL,
      codebook_version TEXT NOT NULL,
      signals_sha256   TEXT,
      scored_at        INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS scores_run_site    ON scores(scoring_run_id, site_id);
    CREATE INDEX        IF NOT EXISTS scores_run_idx     ON scores(scoring_run_id);
    CREATE INDEX        IF NOT EXISTS scores_cohort_idx  ON scores(cohort_id);

    -- Per-dimension breakdown
    CREATE TABLE IF NOT EXISTS score_dimensions (
      scoring_run_id   TEXT NOT NULL,
      site_id          INTEGER NOT NULL,
      dimension_id     TEXT NOT NULL,
      score            REAL,
      confidence       REAL,
      effective_weight REAL,
      PRIMARY KEY (scoring_run_id, site_id, dimension_id)
    );
    CREATE INDEX IF NOT EXISTS sd_run_idx ON score_dimensions(scoring_run_id);

    -- Per-indicator audit trace
    CREATE TABLE IF NOT EXISTS score_indicator_traces (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      scoring_run_id   TEXT NOT NULL,
      site_id          INTEGER NOT NULL,
      dimension_id     TEXT NOT NULL,
      indicator_id     TEXT NOT NULL,
      input_key        TEXT NOT NULL,
      raw_value_json   TEXT,
      rule_type        TEXT NOT NULL,
      score            REAL,
      weight           REAL NOT NULL,
      confidence       REAL NOT NULL,
      note             TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sit_run_site_ind
      ON score_indicator_traces(scoring_run_id, site_id, dimension_id, indicator_id);
    CREATE INDEX        IF NOT EXISTS sit_run_idx
      ON score_indicator_traces(scoring_run_id);

    -- IRR (inter-rater reliability) manual review rows
    CREATE TABLE IF NOT EXISTS manual_reviews (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      irr_round_id     TEXT NOT NULL,
      site_id          INTEGER NOT NULL,
      scoring_run_id   TEXT NOT NULL,
      indicator_id     TEXT NOT NULL,
      rater_id         TEXT NOT NULL,
      rating           INTEGER NOT NULL,
      note             TEXT,
      reviewed_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS mr_round_site_ind_rater
      ON manual_reviews(irr_round_id, site_id, indicator_id, rater_id);
    CREATE INDEX IF NOT EXISTS mr_round_idx ON manual_reviews(irr_round_id);
    CREATE INDEX IF NOT EXISTS mr_site_idx  ON manual_reviews(site_id);

    -- Cross-pipeline provenance
    CREATE TABLE IF NOT EXISTS pipeline_inputs (
      scoring_run_id    TEXT NOT NULL,
      source_app        TEXT NOT NULL,
      source_batch_id   TEXT NOT NULL,
      db_path           TEXT NOT NULL,
      snapshot_sha256   TEXT NOT NULL,
      taken_at          INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (scoring_run_id, source_app, source_batch_id)
    );
    CREATE INDEX IF NOT EXISTS pi_run_idx ON pipeline_inputs(scoring_run_id);
  `);
};

/**
 * Writes (or replaces) _schema_meta for hdri-scores.db.
 */
export const stampScoresMeta = (
  db: Database.Database,
  ownerApp: string,
  schemaVersion: string,
): void => {
  db.prepare(`
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `).run(ownerApp, schemaVersion);
};
