/*
<MODULE_CONTRACT>
<purpose>Ordered, numbered, idempotent schema migrations for the observatory SQLite DB (WP9).</purpose>
<non-goals>
  <item>Do not track applied state or take backups — that is the runner (migrate.ts).</item>
  <item>Do not open connections or manage lifecycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP9: split the former monolithic migrateObservatory() into numbered idempotent migrations.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: migrations are idempotent and recorded in the applied_migrations ledger; never skip the backup step

import type Database from "better-sqlite3";

export type Migration = {
  /** Monotonic, stable, unique — the key recorded in applied_migrations. Never reused. */
  id: number;
  /** Short kebab description; recorded alongside the id for operator legibility. */
  name: string;
  /** Idempotent forward step. Safe to run on a partially-migrated DB. */
  up: (db: Database.Database) => void;
  /**
   * Returns true when applying `up` on the CURRENT DB state would delete or rewrite
   * existing data rows. When any pending migration reports true, the runner takes a
   * protective backup before applying the batch. Additive migrations omit this.
   */
  destructiveWhen?: (db: Database.Database) => boolean;
};

/** ALTER TABLE ADD COLUMN, tolerant of the column already existing. Additive — never rewrites rows. */
const addColumnIfMissing = (
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch {
    // Column already exists — safe to ignore.
  }
};

const tableExists = (db: Database.Database, name: string): boolean =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "core-schema",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS _schema_meta (
          owner_app      TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          built_at       INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
          run_id             TEXT PRIMARY KEY,
          pipeline_app       TEXT NOT NULL,
          pipeline_version   TEXT NOT NULL,
          period             TEXT NOT NULL,
          ontology_version   TEXT NOT NULL,
          codebook_version   TEXT NOT NULL,
          started_at         TEXT NOT NULL,
          finished_at        TEXT,
          status             TEXT NOT NULL DEFAULT 'running'
        );

        CREATE TABLE IF NOT EXISTS asset_states (
          asset_id           TEXT NOT NULL,
          domain             TEXT NOT NULL,
          gewerk_group       TEXT,
          hwo_uid            TEXT,
          hwo_provenance     TEXT,
          bundesland         TEXT,
          gemeinde           TEXT,
          valid_from         TEXT NOT NULL,
          valid_to           TEXT,
          run_id             TEXT NOT NULL,
          PRIMARY KEY (asset_id, valid_from)
        );
        CREATE INDEX IF NOT EXISTS as_domain_idx      ON asset_states(domain);
        CREATE INDEX IF NOT EXISTS as_run_idx         ON asset_states(run_id);
        CREATE INDEX IF NOT EXISTS as_run_asset_idx   ON asset_states(run_id, asset_id);

        CREATE TABLE IF NOT EXISTS observations (
          id                 TEXT PRIMARY KEY,
          asset_id           TEXT NOT NULL,
          signal_path        TEXT NOT NULL,
          ontology_version   TEXT NOT NULL,
          value_bool         INTEGER,
          value_num          REAL,
          value_str          TEXT,
          value_json         TEXT,
          value_type         TEXT NOT NULL,
          observed_at        TEXT NOT NULL,
          recorded_at        TEXT NOT NULL,
          run_id             TEXT NOT NULL,
          evidence_ref       TEXT,
          extractor_version  TEXT,
          confidence         REAL,
          status             TEXT NOT NULL DEFAULT 'active'
        );
        CREATE INDEX IF NOT EXISTS obs_asset_idx   ON observations(asset_id);
        CREATE INDEX IF NOT EXISTS obs_signal_idx  ON observations(signal_path);
        CREATE INDEX IF NOT EXISTS obs_run_idx     ON observations(run_id);

        -- ── Scores ────────────────────────────────────────────────────────────────

        CREATE TABLE IF NOT EXISTS scores (
          id                 TEXT PRIMARY KEY,
          asset_id           TEXT NOT NULL,
          codebook_id        TEXT NOT NULL,
          codebook_version   TEXT NOT NULL,
          overall_score      REAL,
          confidence         REAL NOT NULL,
          computation_hash   TEXT NOT NULL,
          run_id             TEXT NOT NULL,
          scored_at          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sc_asset_idx       ON scores(asset_id);
        CREATE INDEX IF NOT EXISTS sc_run_idx          ON scores(run_id);
        CREATE INDEX IF NOT EXISTS sc_codebook_idx     ON scores(codebook_id, codebook_version);
        CREATE INDEX IF NOT EXISTS sc_run_asset_idx    ON scores(run_id, asset_id);

        CREATE TABLE IF NOT EXISTS score_dimensions (
          score_id           TEXT NOT NULL,
          dimension_id       TEXT NOT NULL,
          score              REAL,
          confidence         REAL NOT NULL,
          effective_weight   REAL NOT NULL,
          PRIMARY KEY (score_id, dimension_id)
        );
        CREATE INDEX IF NOT EXISTS sd_score_idx ON score_dimensions(score_id);

        CREATE TABLE IF NOT EXISTS score_indicator_traces (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          score_id           TEXT NOT NULL,
          dimension_id       TEXT NOT NULL,
          indicator_id       TEXT NOT NULL,
          input_key          TEXT NOT NULL,
          raw_value          TEXT,
          rule_type          TEXT NOT NULL,
          score              REAL,
          weight             REAL NOT NULL,
          confidence         REAL NOT NULL,
          note               TEXT
        );
        CREATE INDEX IF NOT EXISTS sit_score_idx ON score_indicator_traces(score_id);

        -- ── Cohorts ───────────────────────────────────────────────────────────────

        CREATE TABLE IF NOT EXISTS cohorts (
          id                 TEXT PRIMARY KEY,
          description        TEXT,
          codebook_version   TEXT NOT NULL,
          run_id             TEXT NOT NULL,
          created_at         TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS coh_run_idx ON cohorts(run_id);

        CREATE TABLE IF NOT EXISTS cohort_members (
          cohort_id          TEXT NOT NULL,
          asset_id           TEXT NOT NULL,
          strata_system      TEXT NOT NULL DEFAULT 'destatis_group',
          strata_code        TEXT NOT NULL,
          gewerk_group       TEXT,
          bundesland         TEXT,
          PRIMARY KEY (cohort_id, asset_id)
        );
        CREATE INDEX IF NOT EXISTS cm_cohort_idx ON cohort_members(cohort_id);

        CREATE TABLE IF NOT EXISTS cohort_aggregates (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          cohort_id          TEXT NOT NULL,
          axis               TEXT,
          axis_value         TEXT,
          stat_type          TEXT NOT NULL,
          dimension_id       TEXT,
          n                  INTEGER NOT NULL,
          mean               REAL,
          p10                REAL,
          p25                REAL,
          p50                REAL,
          p75                REAL,
          p90                REAL,
          min_val            REAL,
          max_val            REAL
        );
        CREATE INDEX IF NOT EXISTS ca_cohort_idx ON cohort_aggregates(cohort_id);

        -- ── HWO Mappings ──────────────────────────────────────────────────────────

        CREATE TABLE IF NOT EXISTS asset_hwo_mappings (
          asset_id           TEXT NOT NULL,
          mapping_system     TEXT NOT NULL,
          target_code        TEXT NOT NULL,
          target_label       TEXT,
          source             TEXT NOT NULL,
          run_id             TEXT NOT NULL,
          recorded_at        TEXT NOT NULL,
          PRIMARY KEY (asset_id, mapping_system)
        );
        CREATE INDEX IF NOT EXISTS ahm_system_idx ON asset_hwo_mappings(mapping_system, target_code);
        CREATE INDEX IF NOT EXISTS ahm_run_idx ON asset_hwo_mappings(run_id);

        -- ── Emit-bundle sync tracking (idempotency) ───────────────────────────────
        -- Created directly in its final shape (composite PK + bundle columns); the
        -- legacy single-column-PK form is only ever seen on pre-existing DBs, which
        -- migration 6 rebuilds.

        CREATE TABLE IF NOT EXISTS synced_bundles (
          run_id               TEXT NOT NULL,
          app_id               TEXT NOT NULL,
          period               TEXT NOT NULL,
          emitted_at           TEXT NOT NULL,
          obs_count            INTEGER NOT NULL,
          synced_at            TEXT NOT NULL,
          observatory_run_id   TEXT NOT NULL,
          bundle_hash          TEXT,
          asset_state_count    INTEGER,
          PRIMARY KEY (run_id, observatory_run_id)
        );
        CREATE INDEX IF NOT EXISTS sb_app_idx ON synced_bundles(app_id);
        CREATE INDEX IF NOT EXISTS sb_obs_run_idx ON synced_bundles(observatory_run_id);

        -- ── Asset ID resolution map — provisional da_* → canonical UUIDv7 lookup ──

        CREATE TABLE IF NOT EXISTS asset_id_map (
          provisional_id TEXT PRIMARY KEY,
          canonical_id   TEXT NOT NULL,
          domain         TEXT NOT NULL,
          first_seen     TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS aim_canonical_idx ON asset_id_map(canonical_id);
        CREATE INDEX IF NOT EXISTS aim_domain_idx ON asset_id_map(domain);
      `);
    },
  },

  {
    id: 2,
    name: "observation-signing-and-status-columns",
    up: (db) => {
      // Signing columns — added in P0.2.9.
      addColumnIfMissing(db, "observations", "obs_json", "TEXT");
      addColumnIfMissing(db, "observations", "signature", "TEXT");
      addColumnIfMissing(db, "observations", "signed_at", "TEXT");
      addColumnIfMissing(db, "observations", "signing_key_id", "TEXT");
      addColumnIfMissing(db, "observations", "collector_id", "TEXT");

      // Codebook v1.1: signal collection status for conditional missing policy.
      addColumnIfMissing(db, "observations", "collection_status", "TEXT");

      // Codebook v1.1: remediation metadata + declared/actual extractor in score traces.
      addColumnIfMissing(db, "score_indicator_traces", "remediation_json", "TEXT");
      addColumnIfMissing(db, "score_indicator_traces", "declared_extractor", "TEXT");
      addColumnIfMissing(db, "score_indicator_traces", "actual_extractor", "TEXT");
    },
  },

  {
    id: 3,
    name: "period-factory-crawl-columns",
    up: (db) => {
      // P0.4: period columns for direct period-based filtering (no JOIN chain needed).
      addColumnIfMissing(db, "observations", "period", "TEXT");
      addColumnIfMissing(db, "scores", "period", "TEXT");
      addColumnIfMissing(db, "asset_states", "period", "TEXT");
      addColumnIfMissing(db, "asset_states", "gewerk_group", "TEXT");
      addColumnIfMissing(db, "cohort_members", "gewerk_group", "TEXT");

      // P0.4: factory_run_id for bundle-synced observations (alongside run_id = observatory runId).
      addColumnIfMissing(db, "observations", "factory_run_id", "TEXT");
      db.exec("CREATE INDEX IF NOT EXISTS obs_factory_run_idx ON observations(factory_run_id)");

      // P0.4: crawl_hash — source token (e.g. "2026-q2-de") for observation provenance.
      addColumnIfMissing(db, "observations", "crawl_hash", "TEXT");
    },
  },

  {
    id: 4,
    name: "publication-lifecycle",
    up: (db) => {
      // Quarterly archive lifecycle: exactly one canonical published run per period,
      // with candidate/superseded tracking and source bundle metadata.
      addColumnIfMissing(db, "pipeline_runs", "publication_status", "TEXT");
      addColumnIfMissing(db, "pipeline_runs", "published_at", "TEXT");
      addColumnIfMissing(db, "pipeline_runs", "supersedes_run_id", "TEXT");
      addColumnIfMissing(db, "pipeline_runs", "factory_run_id", "TEXT");
      addColumnIfMissing(db, "pipeline_runs", "bundle_hash", "TEXT");
      // Backfill only: fills NULLs, never overwrites an existing status.
      db.exec(
        "UPDATE pipeline_runs SET publication_status = COALESCE(publication_status, 'candidate')",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS pr_period_pub_idx ON pipeline_runs(period, publication_status)",
      );
    },
  },

  {
    id: 5,
    name: "dashboard-export-indexes",
    up: (db) => {
      // Dashboard export acceleration: index score_dimensions by score_id, scores by
      // (run_id, asset_id), and asset_states by (run_id, asset_id) to speed JOIN queries.
      db.exec("CREATE INDEX IF NOT EXISTS sd_score_idx      ON score_dimensions(score_id)");
      db.exec("CREATE INDEX IF NOT EXISTS sc_run_asset_idx  ON scores(run_id, asset_id)");
      db.exec("CREATE INDEX IF NOT EXISTS as_run_asset_idx   ON asset_states(run_id, asset_id)");
    },
  },

  {
    id: 6,
    name: "synced-bundles-composite-pk",
    // Data loss risk only when a legacy single-column-PK table actually holds rows.
    destructiveWhen: (db) => {
      if (!tableExists(db, "synced_bundles")) return false;
      const info = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'synced_bundles'")
        .get() as { sql: string } | undefined;
      if (!info || info.sql.includes("PRIMARY KEY (run_id, observatory_run_id)")) return false;
      const n = db.prepare("SELECT COUNT(*) AS c FROM synced_bundles").get() as { c: number };
      return n.c > 0;
    },
    up: (db) => {
      // Legacy DBs may predate the bundle-hash columns the rebuild SELECT references.
      addColumnIfMissing(db, "synced_bundles", "bundle_hash", "TEXT");
      addColumnIfMissing(db, "synced_bundles", "asset_state_count", "INTEGER");

      // Migrate synced_bundles from single-column PK (run_id) to composite PK
      // (run_id, observatory_run_id) so re-running the observatory pipeline can
      // track the same factory bundle across multiple observatory runs. Fresh DBs
      // already have the composite PK (migration 1) — this is a no-op there.
      const sbInfo = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'synced_bundles'")
        .get() as { sql: string } | undefined;
      if (sbInfo && !sbInfo.sql.includes("PRIMARY KEY (run_id, observatory_run_id)")) {
        db.exec(`
          CREATE TABLE _synced_bundles_new (
            run_id             TEXT NOT NULL,
            app_id             TEXT NOT NULL,
            period             TEXT NOT NULL,
            emitted_at         TEXT NOT NULL,
            obs_count          INTEGER NOT NULL,
            synced_at          TEXT NOT NULL,
            observatory_run_id TEXT NOT NULL,
            bundle_hash        TEXT,
            asset_state_count  INTEGER,
            PRIMARY KEY (run_id, observatory_run_id)
          );
          INSERT INTO _synced_bundles_new
            (run_id, app_id, period, emitted_at, obs_count, synced_at, observatory_run_id, bundle_hash, asset_state_count)
          SELECT run_id, app_id, period, emitted_at, obs_count, synced_at, observatory_run_id, bundle_hash, asset_state_count
          FROM synced_bundles;
          DROP TABLE synced_bundles;
          ALTER TABLE _synced_bundles_new RENAME TO synced_bundles;
          CREATE INDEX sb_app_idx ON synced_bundles(app_id);
          CREATE INDEX sb_obs_run_idx ON synced_bundles(observatory_run_id);
        `);
      }
    },
  },

  {
    id: 7,
    name: "scores-unique-dedup",
    // Data loss risk only when duplicate (run_id, asset_id) score rows actually exist.
    destructiveWhen: (db) => {
      if (!tableExists(db, "scores")) return false;
      const dup = db
        .prepare("SELECT 1 FROM scores GROUP BY run_id, asset_id HAVING COUNT(*) > 1 LIMIT 1")
        .get();
      return Boolean(dup);
    },
    up: (db) => {
      // WP2: enforce exactly one score per (run_id, asset_id). A one-time dedup
      // (keeping the newest rowid, cascading to dependent dimension/trace rows) lets
      // the UNIQUE index be created even on DBs that already contain duplicates.
      const hasScoresUniqIdx = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'scores_run_asset_uniq'",
        )
        .get();
      if (!hasScoresUniqIdx) {
        db.exec(`
          DELETE FROM score_indicator_traces WHERE score_id IN (
            SELECT id FROM scores WHERE rowid NOT IN (
              SELECT MAX(rowid) FROM scores GROUP BY run_id, asset_id
            )
          );
          DELETE FROM score_dimensions WHERE score_id IN (
            SELECT id FROM scores WHERE rowid NOT IN (
              SELECT MAX(rowid) FROM scores GROUP BY run_id, asset_id
            )
          );
          DELETE FROM scores WHERE rowid NOT IN (
            SELECT MAX(rowid) FROM scores GROUP BY run_id, asset_id
          );
          CREATE UNIQUE INDEX scores_run_asset_uniq ON scores(run_id, asset_id);
        `);
      }
    },
  },

  {
    id: 8,
    name: "run-methodology-freeze",
    up: (db) => {
      // WP12: freeze the exact methodology (codebook + ontology + scorer version, plus
      // content hashes) that produced each run's scores, so a published run is reproducible
      // and tamper-evident. Additive: a new table, never touching existing rows.
      db.exec(`
        CREATE TABLE IF NOT EXISTS run_methodology (
          run_id            TEXT PRIMARY KEY,
          codebook_id       TEXT NOT NULL,
          codebook_version  TEXT NOT NULL,
          ontology_version  TEXT NOT NULL,
          scorer_version    TEXT NOT NULL,
          codebook_sha256   TEXT NOT NULL,
          ontology_sha256   TEXT,
          methodology_hash  TEXT NOT NULL,
          frozen_at         TEXT NOT NULL
        );
      `);
    },
  },

  {
    id: 9,
    name: "asset-lifecycle-events",
    up: (db) => {
      // WP13: append-only log of business lifecycle transitions (founded/renamed/merged/
      // split/closed/reopened/reassigned) — the "story" behind a stable asset_id. Additive
      // and immutable: rows are only ever inserted, corrections are new events.
      db.exec(`
        CREATE TABLE IF NOT EXISTS asset_lifecycle_events (
          event_id          TEXT PRIMARY KEY,
          asset_id          TEXT NOT NULL,
          event_type        TEXT NOT NULL,
          event_at          TEXT NOT NULL,
          period            TEXT,
          related_asset_id  TEXT,
          domain            TEXT,
          reason            TEXT,
          source            TEXT NOT NULL,
          recorded_at       TEXT NOT NULL,
          evidence_ref      TEXT
        );
        CREATE INDEX IF NOT EXISTS ale_asset_idx   ON asset_lifecycle_events(asset_id);
        CREATE INDEX IF NOT EXISTS ale_related_idx ON asset_lifecycle_events(related_asset_id);
        CREATE INDEX IF NOT EXISTS ale_type_idx    ON asset_lifecycle_events(event_type);
      `);
    },
  },

  {
    id: 10,
    name: "run-methodology-frame-hash",
    up: (db) => {
      // WP15: the population frame is a methodology input for the published post-stratified
      // numbers, but WP12 only froze the codebook + ontology hashes. Record the frame's content
      // hash too so a period's frozen methodology snapshot (codebook + ontology + frame) is
      // complete and verifiable. Additive; kept OUT of methodology_hash so the WP12 comparability
      // identity (scoring methodology) is unchanged.
      addColumnIfMissing(db, "run_methodology", "frame_sha256", "TEXT");
    },
  },
  {
    id: 11,
    name: "website-availability-events",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS website_availability_events (
          event_id       TEXT PRIMARY KEY,
          asset_id       TEXT NOT NULL,
          period         TEXT NOT NULL,
          outcome        TEXT NOT NULL,
          state          TEXT NOT NULL,
          event_type     TEXT,
          observed_at    TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          evidence_ref   TEXT,
          UNIQUE(asset_id, period)
        );
        CREATE INDEX IF NOT EXISTS wae_asset_period_idx
          ON website_availability_events(asset_id, period);
        CREATE INDEX IF NOT EXISTS wae_outcome_idx
          ON website_availability_events(period, outcome);
      `);
    },
  },
  {
    id: 12,
    name: "pipeline-runs-codebook-id",
    up: (db) => {
      // Separate the codebook *id* (intent, from brief) from the codebook *version*
      // (fact, from scoring). codebook_version is NOT NULL from migration 1 and stays
      // as a placeholder (the codebook id) until ScoreHdriGogol updates it to the real
      // scoring version. Old rows get codebook_id = NULL; backfill from scores or
      // run_methodology if needed.
      addColumnIfMissing(db, "pipeline_runs", "codebook_id", "TEXT");
    },
  },
];
