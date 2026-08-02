# Changelog

All notable changes to the `factory` project are documented here.

## 2026-07-09 .. 2026-07-15

### Added

- Add new base classes and shared helpers for audit and crawl steps in pipeline-steps and hdri-factory packages.

### Changed

- Rename @wgogol/code-compass to @syrokomskyi/code-compass and update all references.
- Rename @org scope to @syrokomskyi across the entire monorepo.
- Refactor: move and rename hdri-factory to factory, digital-observatory to observatory, and hdri-dashboard to dashboard, updating all references and documentation.
- Align workspace, TypeScript configuration, scripts, and documentation after relocating HDRI apps to apps/hdri folder.
- Unify SignSource and VerifyUpstream logic into pipeline-steps base classes for greater consistency.

### Fixed

- Address type safety and dependency hygiene issues in pipeline-steps and hdri-factory packages based on code review.
- Consolidate @org/observatory-asset-id functionality into @org/observatory-core, removing redundant code and improving maintainability.

### Removed

- Remove the observatory-asset-id package, consolidating its features into observatory-core.

### Security

- Concentrate value invariant logic and add more rigorous validation in observatory-core.

### Documentation

- Document new base classes, shared helpers, and pipeline-steps refactoring in package READMEs and onboarding guides.

## 2026-07-02 .. 2026-07-08

### Added

- Split EnrichBundeslandGogol and ParseSourcesGogol into dedicated geo and source modules for improved maintainability.
- Introduce new @wgogol/compass package, replacing @org/compass-checks and GRACE packages, and add initial API, CLI, manifest, and test files.

### Changed

- Rename all GRACE packages, code references, and file headers to COMPASS across the entire monorepo, unifying component and package names.
- Rename @wgogol/compass to @wgogol/code-compass and update all references accordingly.

### Fixed

- Improve detected page deduplication logic in FetchDetectedPagesGogol to fan out updates and enhance reliability.

### Removed

- Remove obsolete GRACE and compass-checks, codegen, and core packages and wiring, consolidating implementations under COMPASS branding.

### Documentation

- Update documentation to reference COMPASS instead of GRACE, including inventory and planning docs.

## 2026-06-25 .. 2026-07-01

### Added

- Introduce opt-in Impressum contact extraction in the factory module, isolated from HDRI (WP5).

### Changed

- Update documentation to reflect the new Impressum contact extraction feature.

### Fixed

- Add unit tests for Impressum contact extraction functionality.

### Documentation

- Update and add documentation for extracting Impressum contacts.

## 2026-06-18 .. 2026-06-24

### Added

- Add new states data to germany-states.geo.json.

### Changed

- Reformat codebase for consistency across all projects.
- Update dependencies: bump @types/node to ^26.0.0, Astro to ^6.4.8, and related AI SDK and supporting packages across the monorepo.

### Fixed

- Address minor typographical and consistency issues in various code and documentation files.

### Removed

- Remove outdated or duplicated markdown and TypeScript files from project directories.

### Security

- Update dependencies to include security fixes in upstream packages.

### Documentation

- Improve documentation formatting and consistency across READMEs and markdown guides.

## 2026-06-11 .. 2026-06-17

### Added

- Update dependencies across multiple packages to include the latest versions of better-sqlite3, astro, @anthropic-ai/sdk, openai, playwright, @cloudflare/workers-types, wrangler, ai, tldts, @quantco/pnpm-licenses, csv-stringify, csv-parse, vitest, @types/node, lighthouse, and sharp, ensuring improved stability and new features where available.

### Changed

- Refresh lockfile to reflect updated dependency versions across all workspace packages.

### Fixed

- Apply compatibility updates through dependency upgrades to address potential bugs and improve performance.

## 2026-06-04 .. 2026-06-10

### Added

- Update dependencies across all packages, including @types/node 25.9.2, tsx 4.22.4, vitest 4.1.8, astro 6.4.4, @astrojs/cloudflare 13.6.1, wrangler 4.98.0, @anthropic-ai/sdk 0.102.0, openai 6.42.0, @google/genai 2.8.0, tldts 7.4.2, and @duckdb/node-api 1.5.3-r.3 to improve compatibility and stability.

### Changed

- Bump a broad set of dev and runtime dependencies throughout the workspace for enhanced reliability and latest features.

### Fixed

- Apply updated dependencies to address known security and bug fixes in underlying packages.

## 2026-05-28 .. 2026-06-03

### Added

- Add GOVERNANCE and METHODOLOGY documentation links and handwerk-digitals.de references to README files across German and English versions to improve discoverability of governance, roles, and scientific methodology.
- Add data source documentation to the Factory README and harvest pipeline, clarifying catalog origins for improved transparency.
- Add RUNBOOK reference links to app section READMEs and convert platform layer references to hyperlinks for easier cross-navigation.
- Add bidirectional language navigation links to HDRI Factory README for seamless switching between German and English documentation.
- Add .env.example files to application directories and include them in HDRI client export script.

### Changed

- Translate root and app-level README files from English to German to align project documentation with target audience, and rewrite root README to document HDRI Analysis Platform architecture and update cross-references.
- Rename all references from 'webgogol' to 'gogol' across monorepo, including documentation, package scopes, and legacy case studies.

### Fixed

- Replace legacy pipeline references with current factory/observatory/dashboard structure in documentation.

### Removed

- Remove obsolete migration guide links and outdated cross-references from documentation.

## 2026-05-21 .. 2026-05-27

### Added

- Add version field to HDRI Factory package.json files to establish 1.0.0 release baseline across all pipeline stages and contract ontology.
- Expand HDRI acronym (Handwerk Digital Readiness Index) in codebook label, ontology label, and documentation across multiple packages for improved clarity.
- Output incremental signing progress with @org/utils logProgress in contract ontology bundle signing.

### Changed

- Increase concurrency from 2 to 12 in Audit-AXE brief to improve accessibility audit throughput.
- Update dependencies across all packages for Node, tsx, vitest, astro, Anthropic SDK, Google GenAI, OpenAI, tldts; also alphabetize digital-observatory workspace imports.

### Fixed

- Propagate gewerk_group field through asset_states and cohort_members, aggregating by gewerk_group consistently across factory and observatory pipelines.
- Restore gewerk_group in emitted asset states by deriving from site_hwo_mappings when missing in core schema, resolving data consistency for industry grouping.

### Removed

- Remove gewerk_group from CoreSite type and SQL query, as it does not exist in core.db schema.

### Documentation

- Clarify index name by expanding HDRI acronym in user-facing labels and technical documentation in the dashboard, observatory, factory, and codebook packages.

## 2026-05-14 .. 2026-05-20

### Added

- Add upstream database path fields and device-specific path substitution to contract-ontology brief and brief template, supporting harvestDbPath, registryDbPath, livenessDbPath, profileDbPath, lighthouseDbPath, and axeDbPath with required validation.

### Changed

- Change auditSampleSize from -1 to 3 in audit-lighthouse brief to enable test limits for faster pipeline iteration.

### Fixed

- Restore audit-lighthouse brief to previous state (auditSampleSize = 3) after temporary change and ensure device-specific path substitution occurs before parsing local brief markdown.

## 2026-05-07 .. 2026-05-13

### Added

- Add logProgress utility with singleLine parameter to support overwriting progress output on the same line and reduce terminal clutter in ClassifyBrancheGogol.

### Changed

- Update ClassifyBrancheGogol to use logProgress with singleLine for clearer console output during classification.

### Fixed

- Correct progress bar behavior in ClassifyBrancheGogol to minimize console clutter.

### Removed

- Remove per-page console.log output in ParseSourcesGogol in favor of logProgress, which reports progress every 1000 pages.
