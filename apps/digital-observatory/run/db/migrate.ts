/*
<MODULE_CONTRACT>
<purpose>DDL migration for the observatory SQLite database.</purpose>
<keywords>database, sqlite, migration, schema</keywords>
<responsibilities>
  <item>Creates observations, asset_states, pipeline_runs, scores, cohorts tables.</item>
  <item>Idempotent: safe to call on every run.</item>
</responsibilities>
<non-goals>
  <item>Do not manage connection lifecycle.</item>
  <item>Do not implement query logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="migrateObservatory">Creates all observatory tables.</entry>
  <entry key="stampRunMeta">Inserts a pipeline_runs row.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
  <item>Add scores, score_dimensions, score_indicator_traces, cohorts, cohort_members tables.</item>
  <item>P0.4: add period (observations, scores, asset_states), factory_run_id (observations), crawl_hash (observations).</item>
  <item>Add gewerk_group to asset_states and cohort_members for industry grouping.</item>
  <item>Add publication lifecycle fields and source bundle metadata for canonical quarterly archive publishing.</item>
  <item>Migrate synced_bundles to composite PRIMARY KEY (run_id, observatory_run_id) so multiple observatory runs can reference the same factory bundle.</item>
  <item>Add sd_score_idx on score_dimensions(score_id), sc_run_asset_idx on scores(run_id, asset_id), and as_run_asset_idx on asset_states(run_id, asset_id) to accelerate dashboard export JOIN queries.</item>
</CHANGE_SUMMARY>
*/

import type Database from 'better-sqlite3';

const addColumnIfMissing = (
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch {
    // Column already exists — safe to ignore
  }
};

export const migrateObservatory = (db: Database.Database): void => {
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

    CREATE TABLE IF NOT EXISTS synced_bundles (
      run_id               TEXT PRIMARY KEY,
      app_id               TEXT NOT NULL,
      period               TEXT NOT NULL,
      emitted_at           TEXT NOT NULL,
      obs_count            INTEGER NOT NULL,
      synced_at            TEXT NOT NULL,
      observatory_run_id   TEXT NOT NULL
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

  // Signing columns — added in P0.2.9. Idempotent via addColumnIfMissing.
  addColumnIfMissing(db, 'observations', 'obs_json',       'TEXT');
  addColumnIfMissing(db, 'observations', 'signature',      'TEXT');
  addColumnIfMissing(db, 'observations', 'signed_at',      'TEXT');
  addColumnIfMissing(db, 'observations', 'signing_key_id', 'TEXT');
  addColumnIfMissing(db, 'observations', 'collector_id',   'TEXT');

  // Codebook v1.1: signal collection status for conditional missing policy.
  // Set when an observation could not be collected (unreachable, forbidden, n/a).
  addColumnIfMissing(db, 'observations', 'collection_status', 'TEXT');

  // Codebook v1.1: remediation metadata + declared extractor in score traces.
  // Enables remediation reports and provenance cross-checks downstream.
  addColumnIfMissing(db, 'score_indicator_traces', 'remediation_json',   'TEXT');
  addColumnIfMissing(db, 'score_indicator_traces', 'declared_extractor', 'TEXT');
  addColumnIfMissing(db, 'score_indicator_traces', 'actual_extractor',   'TEXT');

  // P0.4: period columns for direct period-based filtering (no JOIN chain needed).
  addColumnIfMissing(db, 'observations', 'period',        'TEXT');
  addColumnIfMissing(db, 'scores',      'period',        'TEXT');
  addColumnIfMissing(db, 'asset_states', 'period',        'TEXT');
  addColumnIfMissing(db, 'asset_states', 'gewerk_group',  'TEXT');
  addColumnIfMissing(db, 'cohort_members', 'gewerk_group', 'TEXT');

  // P0.4: factory_run_id for bundle-synced observations (alongside run_id = observatory runId).
  addColumnIfMissing(db, 'observations', 'factory_run_id', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS obs_factory_run_idx ON observations(factory_run_id)');

  // P0.4: crawl_hash — source token (e.g. "2026-q2-de") for observation provenance.
  addColumnIfMissing(db, 'observations', 'crawl_hash',     'TEXT');

  // Quarterly archive lifecycle: exactly one canonical published run per period,
  // with candidate/superseded tracking and source bundle metadata.
  addColumnIfMissing(db, 'pipeline_runs', 'publication_status', 'TEXT');
  addColumnIfMissing(db, 'pipeline_runs', 'published_at',       'TEXT');
  addColumnIfMissing(db, 'pipeline_runs', 'supersedes_run_id',  'TEXT');
  addColumnIfMissing(db, 'pipeline_runs', 'factory_run_id',     'TEXT');
  addColumnIfMissing(db, 'pipeline_runs', 'bundle_hash',        'TEXT');
  db.exec("UPDATE pipeline_runs SET publication_status = COALESCE(publication_status, 'candidate')");
  db.exec('CREATE INDEX IF NOT EXISTS pr_period_pub_idx ON pipeline_runs(period, publication_status)');

  addColumnIfMissing(db, 'synced_bundles', 'bundle_hash',        'TEXT');
  addColumnIfMissing(db, 'synced_bundles', 'asset_state_count',  'INTEGER');

  // Dashboard export acceleration: index score_dimensions by score_id, scores by (run_id, asset_id),
  // and asset_states by (run_id, asset_id) to accelerate JOIN queries.
  db.exec('CREATE INDEX IF NOT EXISTS sd_score_idx      ON score_dimensions(score_id)');
  db.exec('CREATE INDEX IF NOT EXISTS sc_run_asset_idx  ON scores(run_id, asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS as_run_asset_idx   ON asset_states(run_id, asset_id)');

  // Migrate synced_bundles from single-column PK (run_id) to composite PK
  // (run_id, observatory_run_id) so re-running the observatory pipeline can
  // correctly track the same factory bundle across multiple observatory runs.
  const sbInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'synced_bundles'").get() as { sql: string } | undefined;
  if (sbInfo && !sbInfo.sql.includes('PRIMARY KEY (run_id, observatory_run_id)')) {
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
};

export const stampObservatoryMeta = (
  db: Database.Database,
  ownerApp: string,
  schemaVersion: string,
): void => {
  db.prepare(`
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `).run(ownerApp, schemaVersion);
};
