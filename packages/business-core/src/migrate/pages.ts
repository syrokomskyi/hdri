import type Database from 'better-sqlite3';

/**
 * Idempotent DDL migration for pages_{YYYY}.db.
 * All tables owned by site-profile that store crawled page content.
 *
 * Must be called once before any app reads or writes pages_{YYYY}.db.
 */
export const migratePages = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      owner_app      TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      built_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS page_contents (
      sha256       TEXT PRIMARY KEY,
      storage_path TEXT NOT NULL,
      byte_size    INTEGER,
      first_seen_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS site_pages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id           INTEGER NOT NULL,
      url_norm          TEXT NOT NULL,
      url_sha256        TEXT NOT NULL,
      url_normalizer_ver TEXT NOT NULL DEFAULT 'v1',
      source            TEXT NOT NULL DEFAULT 'homepage',
      first_seen_at     INTEGER DEFAULT (unixepoch()),
      last_seen_at      INTEGER DEFAULT (unixepoch()),
      UNIQUE(site_id, url_sha256)
    );
    CREATE INDEX IF NOT EXISTS sp_site_idx ON site_pages(site_id);
    CREATE INDEX IF NOT EXISTS sp_source_idx ON site_pages(source);

    CREATE TABLE IF NOT EXISTS page_observations (
      site_page_id   INTEGER NOT NULL PRIMARY KEY,
      content_sha256 TEXT NOT NULL,
      is_new_content INTEGER NOT NULL,
      observed_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS po_content_idx ON page_observations(content_sha256);

    CREATE TABLE IF NOT EXISTS ext_impressum (
      content_sha256        TEXT PRIMARY KEY,
      extractor_ver         TEXT NOT NULL,
      present               INTEGER NOT NULL,
      url                   TEXT,
      confidence            INTEGER,
      detected_page_sha256  TEXT,
      extracted_at          INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ext_datenschutz (
      content_sha256        TEXT PRIMARY KEY,
      extractor_ver         TEXT NOT NULL,
      present               INTEGER NOT NULL,
      url                   TEXT,
      confidence            INTEGER,
      detected_page_sha256  TEXT,
      extracted_at          INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ext_opening_hours (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      text            TEXT,
      source          TEXT,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ext_cookie_banner (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ext_copyright_year (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      year            INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS ext_impressum_ver_idx    ON ext_impressum(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_datenschutz_ver_idx  ON ext_datenschutz(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_opening_hours_ver_idx ON ext_opening_hours(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_cookie_banner_ver_idx ON ext_cookie_banner(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_copyright_year_ver_idx ON ext_copyright_year(extractor_ver);

    -- ── Schema.org types ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS ext_schema_local_business (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_service (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_faq (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_how_to (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_breadcrumb (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_opening_hours_spec (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_person (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_review (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_schema_product (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS ext_schema_local_business_ver_idx     ON ext_schema_local_business(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_service_ver_idx            ON ext_schema_service(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_faq_ver_idx                ON ext_schema_faq(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_how_to_ver_idx             ON ext_schema_how_to(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_breadcrumb_ver_idx         ON ext_schema_breadcrumb(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_opening_hours_spec_ver_idx ON ext_schema_opening_hours_spec(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_person_ver_idx             ON ext_schema_person(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_review_ver_idx             ON ext_schema_review(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_schema_product_ver_idx            ON ext_schema_product(extractor_ver);

    -- ── Legal pages ──────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS ext_bfsg_page (
      content_sha256        TEXT PRIMARY KEY,
      extractor_ver         TEXT NOT NULL,
      present               INTEGER NOT NULL,
      url                   TEXT,
      confidence            INTEGER,
      detected_page_sha256  TEXT,
      extracted_at          INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_agb_page (
      content_sha256        TEXT PRIMARY KEY,
      extractor_ver         TEXT NOT NULL,
      present               INTEGER NOT NULL,
      url                   TEXT,
      confidence            INTEGER,
      detected_page_sha256  TEXT,
      extracted_at          INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_widerruf_page (
      content_sha256        TEXT PRIMARY KEY,
      extractor_ver         TEXT NOT NULL,
      present               INTEGER NOT NULL,
      url                   TEXT,
      confidence            INTEGER,
      detected_page_sha256  TEXT,
      extracted_at          INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_versand_page (
      content_sha256        TEXT PRIMARY KEY,
      extractor_ver         TEXT NOT NULL,
      present               INTEGER NOT NULL,
      url                   TEXT,
      confidence            INTEGER,
      detected_page_sha256  TEXT,
      extracted_at          INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS ext_bfsg_page_ver_idx    ON ext_bfsg_page(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_agb_page_ver_idx     ON ext_agb_page(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_widerruf_page_ver_idx ON ext_widerruf_page(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_versand_page_ver_idx ON ext_versand_page(extractor_ver);

    -- ── Content signals ──────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS ext_contact_form (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_portfolio (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_map (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_team_page (
      content_sha256        TEXT PRIMARY KEY,
      extractor_ver         TEXT NOT NULL,
      present               INTEGER NOT NULL,
      url                   TEXT,
      confidence            INTEGER,
      detected_page_sha256  TEXT,
      extracted_at          INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_testimonials (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_certifications (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_awards (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_memberships (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_meister (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_case_studies (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      confidence      INTEGER,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS ext_contact_form_ver_idx  ON ext_contact_form(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_portfolio_ver_idx     ON ext_portfolio(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_map_ver_idx           ON ext_map(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_team_page_ver_idx     ON ext_team_page(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_testimonials_ver_idx  ON ext_testimonials(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_certifications_ver_idx ON ext_certifications(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_awards_ver_idx        ON ext_awards(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_memberships_ver_idx   ON ext_memberships(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_meister_ver_idx       ON ext_meister(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_case_studies_ver_idx  ON ext_case_studies(extractor_ver);

    -- ── External links ───────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS ext_link_handelsregister (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_link_unternehmensregister (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_link_kammern (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_link_industry_catalogs (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_link_google_business (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS ext_link_handelsregister_ver_idx      ON ext_link_handelsregister(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_link_unternehmensregister_ver_idx ON ext_link_unternehmensregister(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_link_kammern_ver_idx              ON ext_link_kammern(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_link_industry_catalogs_ver_idx    ON ext_link_industry_catalogs(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_link_google_business_ver_idx      ON ext_link_google_business(extractor_ver);

    -- ── Social platform links ────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS ext_social_facebook (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_instagram (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_youtube (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_xing (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_linkedin (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_tiktok (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_whatsapp (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_pinterest (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ext_social_twitter (
      content_sha256  TEXT PRIMARY KEY,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      url             TEXT,
      extracted_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS ext_social_facebook_ver_idx  ON ext_social_facebook(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_instagram_ver_idx ON ext_social_instagram(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_youtube_ver_idx   ON ext_social_youtube(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_xing_ver_idx      ON ext_social_xing(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_linkedin_ver_idx  ON ext_social_linkedin(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_tiktok_ver_idx    ON ext_social_tiktok(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_whatsapp_ver_idx  ON ext_social_whatsapp(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_pinterest_ver_idx ON ext_social_pinterest(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_social_twitter_ver_idx   ON ext_social_twitter(extractor_ver);

    -- ── Contact signals ───────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS ext_phone (
      content_sha256  TEXT NOT NULL,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      count           INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (content_sha256, extractor_ver)
    );
    CREATE TABLE IF NOT EXISTS ext_email (
      content_sha256  TEXT NOT NULL,
      extractor_ver   TEXT NOT NULL,
      present         INTEGER NOT NULL,
      count           INTEGER NOT NULL,
      extracted_at    INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (content_sha256, extractor_ver)
    );
    CREATE INDEX IF NOT EXISTS ext_phone_ver_idx ON ext_phone(extractor_ver);
    CREATE INDEX IF NOT EXISTS ext_email_ver_idx ON ext_email(extractor_ver);
  `);

  // Codebook v1.1: cookie consent quality enum signal (5-level).
  // Idempotent — ALTER TABLE ... ADD COLUMN throws if the column exists.
  const idempotentAdd = (table: string, column: string, type: string) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); } catch { /* ok */ }
  };

  idempotentAdd('ext_cookie_banner', 'quality', 'TEXT');

  // Phase B: extended page_observations columns. Capture redirect chains, HTTP
  // outcome class, and per-row provenance so a-contract-ontology can emit the
  // right collection_status and observatory can attribute observations to a
  // specific (deviceId, sourceToken).
  idempotentAdd('page_observations', 'url_final',      'TEXT');
  idempotentAdd('page_observations', 'redirect_chain', 'TEXT'); // JSON array of URLs
  idempotentAdd('page_observations', 'http_status',    'INTEGER');
  // error_class enum: 'ok' | 'network' | 'http_4xx' | 'http_5xx' | 'parse'
  //                  | 'robots' | 'timeout' | 'ssl' | 'http_3xx_loop'
  idempotentAdd('page_observations', 'error_class',    "TEXT NOT NULL DEFAULT 'ok'");
  idempotentAdd('page_observations', 'device_id',      "TEXT NOT NULL DEFAULT ''");
  idempotentAdd('page_observations', 'source_token',   "TEXT NOT NULL DEFAULT ''");
};

/**
 * Writes _schema_meta for pages_{YYYY}.db.
 * Call after migratePages, once per db lifetime.
 */
export const stampPagesMeta = (
  db: Database.Database,
  ownerApp: string,
  schemaVersion: string,
): void => {
  db.prepare(`
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `).run(ownerApp, schemaVersion);
};
