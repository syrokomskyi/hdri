# Changelog

All notable changes to the `observatory` project are documented here.

## 2026-07-09 .. 2026-07-15

### Added

- Extract createAppPaths, toDisplayPath, phase-registry factory, gogol-registry factory, engine factory, and declaration loader factory into pipeline-node package, reducing boilerplate across pipeline apps.
- Extract shared Gogol base class into pipeline-node to standardize custom Gogol implementations.

### Changed

- Upgrade dependencies and normalize package.json formatting across all apps and packages.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass throughout the monorepo.
- Rename @org scope to @syrokomskyi across the monorepo.
- Rename hdri-factory to factory, digital-observatory to observatory, and hdri-dashboard to dashboard for better clarity and consistency.
- Align workspace structure, TypeScript configs, scripts, and documentation after moving HDRI apps into the apps/hdri directory.

### Fixed

- Consolidate @org/observatory-asset-id into @syrokomskyi/observatory-core and remove redundant observatory-asset-id package.
- Replace all @org/pipeline-node/fs imports with @syrokomskyi/pipeline-node/context in remaining apps to ensure correct context resolution.

### Removed

- Remove the deprecated observatory-asset-id package from the monorepo.

### Documentation

- Update documentation and README files to reflect new naming conventions and workspace structure.

## 2026-07-02 .. 2026-07-08

### Added

- Introduce initial COMPASS packages by splitting from previous GRACE modules.
- Add new CLI, core, and codegen packages for COMPASS.
- Implement initial tests for COMPASS core and CLI functionality.

### Changed

- Update all relevant application, tool, and test imports to reference COMPASS instead of GRACE.

### Fixed

- Resolve minor inconsistencies in tool and manifest references during the package splitting process.

### Removed

- Remove GRACE kernel references from site and other app kernels.

### Documentation

- Add initial GRACE-to-COMPASS migration notes and inventory documentation.

## 2026-06-25 .. 2026-07-01

### Added

- Introduce quarterly data-quality drift gate and core tests.
- Add mechanical vault shard immutability with overwrite protection and read-only enforcement.
- Backfill vault-manifest for pre-WP10 shards with supporting tools and tests.
- Provide offsite vault replication and scheduled verification capabilities.
- Publish trusted root keys and automate key-rotation ceremonies for crypto.
- Surface WP15 methodology changelog on the Dashboard Methodik page.
- Validate population frame readiness with new validator and template for post-stratification.
- Enforce methodology_hash comparability as part of the promotion gate.
- Add tool to backfill registry identity for healing before Q3.
- Guardedly backfill run_methodology for pre-WP12 runs.
- Implement methodology changelog and frozen per-period snapshots.
- Enable hot/cold obs_json storage tiering.
- Model business lifecycle events in Observatory with supporting storage and test coverage.
- Freeze methodology into each run’s record for WP12b.
- Maintain a cross-year stable asset identity registry.
- Enable vault shard manifest, planned verification, and CI gating.
- Introduce versioned migrations with pre-migration backup.
- Add publication gates via staging and validate tools.
- Provide rebuild-from-vault functionality and round-trip invariants.
- Add canonical Q-snapshot tool for durability.
- Add population-frame template and treat empty frames as absent.
- Enhance statistical rigor for cross-quarter trends analytics.
- Introduce integrity guards for cross-quarter period comparisons.
- Support idempotent scoring/cohort builds and superseded-run garbage collection.
- Add bounded-memory and collision-safe DB factory sync.
- Add read-only integrity and comparability validator.

### Changed

- Pin Node and pnpm runtime versions to the codebase.
- Streamline verify:vault process to avoid loading all rows at once.
- Relabel pipeline_runs.codebook_version to reference the scoring version.
- Refine handling in codebook version and validator tooling.
- Refactor various tools and core modules for compatibility with new features and test coverage.

### Fixed

- Heal cross-year asset identity using the asset_id_map.
- Reduce flakiness in DuckDB durability vitest timeouts.
- Ensure idempotency in scoring and cohort generation.

### Removed

- Remove legacy code paths in migrations, scoring, and sync processes to support added features.

### Security

- Strengthen key publication and root-trusting mechanisms.

### Documentation

- Update RUNBOOK and LONGEVITY MD files, including DR runbook test cases and tested scenarios.
- Align METHODOLOGY.md with new statistical rigor features.

## 2026-06-18 .. 2026-06-24

### Added

- Add new geo data for German states in HDRI dashboard

### Changed

- Reformat codebase for consistent style across all apps and packages
- Update AI SDK packages and dependencies across the monorepo, including Astro to 6.4.8 and @types/node to 26.0.0

### Fixed

- Correct minor inconsistencies and formatting issues in documentation, code, and prompts throughout all modules

### Removed

- Remove deprecated source-records and legal disclaimer/imprint/privacy policy files from Site app

### Documentation

- Update and clarify documentation in AGENTS.md, READMEs, and various prompt guides

## 2026-06-11 .. 2026-06-17

### Added

- Add support for csv-parse 7.x and csv-stringify 6.8.0.

### Changed

- Update dependencies across multiple packages, including better-sqlite3, astro, @anthropic-ai/sdk, openai, playwright, @cloudflare/workers-types, wrangler, ai, tldts, @quantco/pnpm-licenses, vitest, @types/node, lighthouse, and sharp to their latest versions.

### Fixed

- Apply bug fixes and security improvements from upstream dependency updates.

## 2026-06-04 .. 2026-06-10

### Changed

- Update dependencies across all workspace packages, including @types/node, tsx, vitest, astro, @astrojs/cloudflare, wrangler, @anthropic-ai/sdk, openai, @google/genai, tldts, and @duckdb/node-api, to their latest versions.

## 2026-05-28 .. 2026-06-03

### Added

- Add German translations for root and app README files to align with target audience.
- Add METHODOLOGY documentation files and links in both English and German README files to improve scientific methodology discoverability.
- Add bidirectional language navigation to all main and exported app README files.
- Add .env.example files for digital observatory, dashboard, factory apps, and pipeline-ai package for improved onboarding.

### Changed

- Rewrite root README.md to focus on HDRI Analysis Platform architecture and use the updated factory/observatory/dashboard structure, with English translation and updated cross-references.
- Rename 'webgogol' to 'gogol' across all documentation, package names, and legacy case study references for consistency.
- Update publication domain in all documentation files from handwerk-digitals.de to handwerk-index.de.

### Fixed

- Update or replace outdated references in documentation including obsolete migration guide links.

### Removed

- Remove obsolete links to deprecated migration guides from documentation.

## 2026-05-21 .. 2026-05-27

### Added

- Add hdri-dashboard workspace to monorepo with initial dashboard export script and starter data/assets.
- Add AXE accessibility audit metrics to ontology and integrate as 'accessibility_audit' dimension in codebook with scoring support using countClampInverse.
- Add gewerk_group field for industry grouping, enabling aggregation throughout data pipeline.
- Add .debug-public folder and implement removal of domain field from debug CSV/JSON artifacts to protect site identities in public exports.
- Add console progress indicators for dashboard archive export milestones.
- Add stdDev to ScoreSummary, compute reliability classification, and display percentile tooltips, IQR bars, reliability indicators, and provenance badges in the dashboard.
- Add index fields sd_score_idx and sc_run_asset_idx for performance optimization of dashboard export queries.
- Add HDRI acronym expansion and clarification to labels and documentation across codebase.
- Add data mart explanation to export-mart documentation.

### Changed

- Switch codebook export from JSON to YAML, reformat notes with block scalar, and update dashboard to parse YAML at build time.
- Capitalize first word of codebook changelog entries and update codebook version reference in brief configuration.
- Rebalance codebook dimension weights in v1.3 and set consent_quality default scoring to 'skip' for not_applicable cases.
- Replace median with p50 and add p10/p90 percentiles to statistical aggregates, using p75 for rankings throughout dashboard and comparison data.
- Streamline export tasks: parallelize DB reads and period writes, simplify previous period resolution, and reduce resource usage in dashboard exporter.
- Update period manifests, trends, and dashboard data to support new/updated cohort/grouping logic.
- Update synced_bundles table schema to composite PRIMARY KEY (run_id, observatory_run_id) to allow multiple observatory runs to track the same factory bundle, and later revert migration to restore global idempotency and original single-key schema.
- Replace raw console.log and console.warn with structured NDJSON logging throughout data pipeline and sync routines, including contextual metadata.
- Change factoryContractRootDir and other local paths in configuration from absolute to relative paths.

### Fixed

- Fix auto-discovery for manifest.json by reading at device level using manifest.emit_dir.
- Fix re-sync behavior after codebook changes for multiple observatory runs referencing the same factory bundle.

### Removed

- Remove obsolete fixture codebook files and the now-redundant v1 YAML export, streamline test references.

### Security

- Remove site domain columns from public debug exports to avoid exposing identities.

### Documentation

- Add HDRI Dashboard regeneration workflow steps to digital-observatory README and clarify dashboard data consumption model.
- Expand methodology documentation with explanations of statistical concepts (P75, IQR), reliability interpretation, and add an FAQ section.
- Add logProgress usage documentation for single-line progress output in SignObservationsGogol.

## 2026-05-14 .. 2026-05-20

### Added

- Add auto-discovery of emit bundle path to digital-observatory via factoryContractRootDir and resolveEmitDirs(), enabling automatic location of .output/<DEVICE_ID>/emit/<period>/.
- Add period, factory_run_id, and crawl_hash columns to the observations table for improved direct period filtering and factory provenance tracking.
- Add fail-fast validation in EnrichBundeslandGogol when zero sites resolve to Bundesland.

### Changed

- Update site_pages table to be stored in pages-YYYY.db instead of core_YYYY.db, moving its definition and DDL from core to pages schema and updating TranslateProfileObservationsGogol joins accordingly.
- Update db-round-trip test to seed and query site_pages from the pages DB.

### Fixed

- Fix handling of brief and main run logic to use new observation columns and adapt to updated site_pages location.

### Removed

- Remove site_pages DDL from core migration and schema files.

## 2026-05-07 .. 2026-05-13

### Added

- Add support for registering new businesses, contract ontology, and associated configuration and test files.
- Add new data mappings for 'branche' classification, including destatis-mapping and hwo-master datasets.

### Changed

- Upgrade dependencies across all packages to latest versions for compatibility and updated features.
- Refactor branche classification logic and data structures, improving maintainability by removing obsolete mapping code and enhancing the classifier.

### Fixed

- Update file and field references in tests and migration scripts to ensure compatibility with recent refactorings.

### Removed

- Remove deprecated and unused mapping file for branche classification to streamline source management.

### Security

- Update dependencies to incorporate latest security patches and improvements.

### Documentation

- Expand and update example brief files and RUNBOOKs to reflect new features and configuration details.
