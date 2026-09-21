# Changelog

All notable changes to the `business-core` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add changelog links to all README.md files for improved navigation.
- Generate CHANGELOG.md files for all packages and applications.
- Add initial AGENTS.md files describing agents for each package and app.

### Changed
- Regenerate all AGENTS.md files to reflect updates as per RFC-0070.
- Rename @wgogol/changelog-live to @warpgogol/changelog-live for consistency across the monorepo.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to restore compatibility with typescript-eslint.

### Documentation
- Update documentation for all README.md, AGENTS.md, and CHANGELOG.md files to ensure accuracy and comprehensiveness.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across multiple packages and add a new README.md for documentation.
- Add project narrative documentation.

### Changed
- Upgrade various dependencies across the workspace to latest versions.
- Refactor business-core by splitting ext-signals.ts into multiple files organized by signal group.

### Fixed
- Align vitest versions in all configuration files and merge AGENTS.md documentation.

### Removed
- Remove code-compass from all package.json devDependencies and scripts.
- Flatten project structure by relocating apps/source/* to the project root and removing redundant source documentation, configuration, and binary files.

### Documentation
- Update and merge AGENTS.md and project documentation content.

## 2026-07-09 .. 2026-07-15

### Added
- Add @eslint/js and typescript-eslint to devDependencies for improved linting across all apps and packages.
- Add eslint as a devDependency to all apps and packages for consistent linting.

### Changed
- Rename all usages of @org npm scope to @syrokomskyi across the monorepo for consistency.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass and update references throughout the codebase.
- Upgrade dependencies and normalize package.json formatting across all apps and packages.
- Update dependencies across all packages and apps to the latest versions.

### Fixed
- Use node to invoke the eslint binary directly in all apps and packages to fix linting script issues.

### Removed
- Remove references to scripts/setup-device-id.ts and unused turbo pipeline configuration entries.

### Documentation
- Reformat and synchronize documentation across architecture, skills, and onboarding guides for improved clarity.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS to all packages for root-level commands and enable dotenv support in COMPASS CLI for automatic .env loading.
- Annotate business-core source files for improved code clarity.

### Changed
- Rename @wgogol/compass to @wgogol/code-compass and update all references.
- Rename @org/compass-checks to @wgogol/compass and update dependencies accordingly.

### Fixed
- Remove forbidden blocks from brand-inticle, business-core, image-vectorizer, observatory-crypto, observatory-emit, pipeline-core, pipeline-node, and scripts to resolve grace-related issues.

### Removed
- Deprecate and remove compass-checks and compass-core packages, consolidating functionality into @wgogol/compass and @wgogol/code-compass.

## 2026-06-25 .. 2026-07-01

### Added
- Add optional Impressum contact extraction feature to factory pipeline, isolated from HDRI (WP5)
- Add documentation and tests for Impressum contact extraction

### Changed
- Update pipeline registry and migration to support Impressum contact extraction

### Documentation
- Document Impressum contact extraction process in relevant markdown files

## 2026-06-18 .. 2026-06-24

### Added
- Add missing documentation files for several packages and apps.

### Changed
- Reformat code and documentation across all packages and applications for consistency.

### Fixed
- Correct minor inconsistencies and cleanup in config, test, and prompt files.

### Removed
- Remove duplicate or obsolete markdown documentation entries where appropriate.

### Security
- No security-related changes were made in this release.

### Documentation
- Standardize and update readme and methodology documentation across main packages.

## 2026-06-11 .. 2026-06-17

### Added
- Add support for csv-parse v7.0.0 and csv-stringify v6.8.0.

### Changed
- Update dependencies across all packages, including better-sqlite3, astro, @anthropic-ai/sdk, openai, playwright, @cloudflare/workers-types, wrangler, ai, tldts, @quantco/pnpm-licenses, and vitest, to their latest versions for improved reliability and compatibility.

## 2026-05-14 .. 2026-05-20

### Added
- Add fail-fast validation in EnrichBundeslandGogol when zero sites resolve to a Bundesland.
- Add MODULE_CONTRACT documentation to 3-extract-profile/run-app.ts and connection.ts.

### Changed
- Move site_pages table from core_YYYY.db and registry.db to pages-YYYY.db, updating all extract and translation gogols to join site_pages from the new location, and update schema and migrations accordingly.
- Update db-round-trip test to seed and query site_pages from pages DB.
- Update gogols and schema to remove reliance on local or attached registry.db for site_pages.
- Update all harvest, liveness, extract-profile, audit-lighthouse, and audit-axe gogols, pipelines, and schemas to remove batch IDs (harvestBatchId, auditBatchId), batch_id columns, and related filtering, simplifying pipelines to process entire datasets and upsert using natural keys.

### Fixed
- Fix all affected pipelines, gogols, and queries to ensure stability and correctness without batch filtering after removing batch_id fields.

### Removed
- Remove auditBatchId and harvestBatchId from pipeline state, JSON outputs, markdown reports, schemas, and database tables (including sites, site_source_seeds, skipped_source_seeds, source_file_stats, audit_runs, lighthouse_runs, axe_runs, and related apps, types, and core modules).
- Remove openRegistryDbReadWrite from connection.ts.
- Remove site_pages DDL from core and registry migrations and schemas.

### Documentation
- Update documentation for MODULE_CONTRACTS, pipeline phases, and pipeline definitions to reflect new site_pages table location and removal of batch IDs.

## 2026-05-07 .. 2026-05-13

### Added
- Add extract-phone and extract-email steps to the pipeline with dedicated schema tables for storing extracted phone and email signals.
- Add ext_phone and ext_email tables to pages.db schema for robust contact signal extraction with composite primary keys, extraction counts, timestamps, and version indexing.
- Add fetchDetectedPages configuration and pipeline step, allowing optional fetching of detected internal pages (e.g., impressum, datenschutz) in extraction phase, plus schema updates for detected URLs and homepage/source distinction.
- Add snake_case fallback support for camelCase fields in mapping data parsing to improve compatibility with different naming conventions.

### Changed
- Rewrite CollectSignalsGogol to aggregate phone and email presence/count from new ext\_\* tables instead of the deprecated content_contacts.
- Upgrade multiple dependencies for enhanced reliability and compatibility.
- Change rescan policy in 2-extract-profile to re-fetch pages older than 30 days instead of skipping all previously observed domains.

### Fixed
- Implement various minor fixes and data updates across loader, classifier, and mapping modules to improve reliability and accuracy.

### Removed
- Remove deprecated content_contacts usage and obsolete code from mapping, schema, and ingestion modules.

### Documentation
- Update and add documentation for new pipeline phases and steps, including extract-phone, extract-email, fetch-detected-pages, and rescan policy, along with related brief and configuration files.

## 2026-04-30 .. 2026-05-06

### Added
- Add new Extract\*Gogol modules and English documentation for enhanced extraction coverage, including business, legal, social, and schema information.
- Add extraction and summarization pipeline phases and update pipeline registry with new extraction capabilities.
- Add copyright year extraction from site footers and meta tags to site-profile pipeline, including reporting in SummarizeProfileGogol and associated schema migration.
- Add gemeinde field to cohort stratification, aggregation, and sites schema with EnrichGemeindeGogol to store and analyze per-gemeinde statistics across multiple pipelines.
- Add bundesland and gemeinde columns to liveness_checks table and support geographic liveness analysis with registered LivenessByBundeslandGogol and LivenessByGemeindeGogol in site-liveness pipeline check phase.

### Changed
- Translate and update package README files and inline comments from Russian to English across multiple packages for improved accessibility.
- Bump PAGES*SCHEMA_VERSION and RULE_EXTRACTOR_VER for schema and extraction rule changes, splitting monolithic content_extractions table into dedicated ext*\* tables and refactoring usage in extraction logic and queries.

### Fixed
- Refactor CrawlAndExtractGogol into separate crawl and extract-\* gogols and update SummarizeProfileGogol queries to use new extraction schema.

### Removed
- Remove redundant gemeinde column migration logic from core.ts, as enrichment is now handled by pipeline.

### Documentation
- Add extensive English documentation for new extraction modules and pipeline phases.

## 2026-04-23 .. 2026-04-29

### Added
- Add industry branch mapping service and automated GewerkGroup classification via Branche keyword mapping.
- Add extensive keyword and alias mappings, signal-based matching, and multi-signal fallback to the branche classifier.
- Introduce CSV result logging enhancements and scripts to generate files for unclassified records.
- Add csv-parse development dependency and README files for all packages and modules.

### Changed
- Refactor and expand branche classification logic to use unified keyword maps, apply ignore/alias/weak sets, normalise keywords, and prefer strong matches; consolidate mapping logic and improve handling of company name, category, and domain signals.

### Fixed
- Fix typos in raw branch ignore set, normalize keywords before matching, and remove duplicate or misspelled aliases.

### Removed
- Remove deprecated dump scripts and outdated unclassified CSV output files.

### Documentation
- Add comprehensive README documentation for all core packages and application modules.

## 2026-04-16 .. 2026-04-22

### Added
- Introduce business-core package with reusable migration and schema logic for catalogs, pages, and core batch management.
- Add catalog-harvest pipeline including data ingestion, deduplication, branche classification, and snapshot functionality, along with docs and configuration files.
- Add initial batch of catalog data and parsing routines for testing catalog-harvest app.
- Add site-liveness app and associated pipeline for checking and summarizing liveness of web resources.
- Add business-crawler package with foundational modules for batch processing and liveness checks.
- Introduce hdri-scoring app with scoring pipeline, including cohort building, signal collection, and site scoring routines, plus fixtures and documentation.
- Add hdri-codebook package for codebook management and scoring rules logic with tests and fixtures.
- Add site-deep-audit app and pipeline supporting Lighthouse, axe, and other deep audit indicators, with rate limiting and audit summarization.
- Introduce business-rate-limit package for concurrency and quota management, including circuit breaker, limiter, and retry logic with tests.
- Expand data model and pipelines to support governance structures, IRR computation, DSGVO, self-report intake, and enforce k-anonymity, plus new migration and schema modules.

### Changed
- Refine and update score, liveness, and governance-related pipelines, config, and related core utilities.
- Minor updates in existing parsing and classification logic to harmonize batch processing and data ingestion across modules.

### Fixed
- Fix minor issues in ParseCatalogsGogol and core business mapping utilities.

### Documentation
- Add and update extensive pipeline and gogol documentation for all new modules, phases, and components, including audit, scoring, governance, and catalog harvesting.
