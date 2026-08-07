# Changelog

All notable changes to the `observatory-core` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add AGENTS.md files to all packages and apps to document agent usage and skills.
- Add changelog links to all README.md files across packages and apps.
- Generate initial CHANGELOG.md files for all packages and apps.
- Implement versioned HDRI availability signals in observatory-core.
- Implement HDRI deterministic observation streaming in observatory-core.
- Implement HDRI website availability transitions in observatory-core.

### Changed
- Rename the @wgogol/changelog-live package to @warpgogol/changelog-live per RFC-0070.
- Migrate forge dependency from @webgogol/forge@0.3.0 to @warpgogol/forge@0.7.0.
- Update various package dependencies, including TypeScript, eslint, and others to latest versions.
- Update multiple package-related files for compatibility and new conventions.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to restore compatibility with typescript-eslint.

### Documentation
- Document agent principles and skill guidelines for improved developer onboarding.
- Update documentation to reflect package name and dependency changes.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across multiple packages and services
- Add initial README file to the repository.

### Changed
- Upgrade dependencies across the workspace to align with latest versions
- Align all vitest versions for consistent test execution
- Refactor observatory-core to consolidate EXT_SIGNAL_MAP into SIGNAL_MAP_DATA constant.
- Flatten project structure by moving apps/source/* to the repository root.

### Fixed
- Restore and synchronize AGENTS.md documentation across the project.

### Removed
- Remove code-compass from all package.json devDependencies and scripts
- Remove legacy apps/source/ structure and related source-only files to streamline the repo.

### Documentation
- Merge and update project documentation, including README, AGENTS.md, and compass inventory.

## 2026-07-09 .. 2026-07-15

### Added
- Add missing devDependencies for linting and Vitest across all packages and apps.

### Changed
- Rename all @org package and import scopes to @syrokomskyi across the monorepo.
- Rename hdri-factory to factory, digital-observatory to observatory, and hdri-dashboard to dashboard throughout the workspace.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass and update all affected references.
- Normalize package.json formatting across all apps and packages.
- Align workspace configurations, tsconfig files, and scripts after directory moves and renames.

### Fixed
- Use node to invoke the eslint binary directly in all packages and apps.
- Update resolve conditions for @org/source across all Vitest configs.
- Consolidate @org/observatory-asset-id into @org/observatory-core and update related imports.

### Removed
- Remove the observatory-asset-id package after consolidation.

### Documentation
- Update AGENTS.md and observatory-core README to reflect architectural and naming changes.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS scaffolding and source files to core packages using the annotate command, enabling standardized code structure and utilities across the workspace.
- Introduce COMPASS to all core packages and enable root-level COMPASS commands for improved workflow.

### Changed
- Rename @org/compass-checks to @wgogol/compass and restructure related package files to align with new package naming.
- Rename @wgogol/compass to @wgogol/code-compass, updating package references and folder structures accordingly.

### Fixed
- Apply Prettier formatting to city, digital-observatory, and core manifest files to standardize code style.
- Add property-based tests for hashing and ID functionality in observatory-core to improve test coverage and reliability.

### Removed
- Remove deprecated compass-checks, compass-codegen, and compass-core packages and tests as part of the COMPASS migration.

## 2026-06-25 .. 2026-07-01

### Added
- Add business lifecycle event model to the observatory core and associated tests.
- Add vault shard manifest functionality with planned verification and a CI gate to ensure integrity.
- Add PII isolation invariant tests for Impressum contacts in observatory-core.

### Changed
- Update vault shard writer and reader to support manifests.

### Fixed
- Address minor issues in vault shard handling and ontology loader related to manifests.

### Documentation
- Add documentation for business lifecycle events in LONGEVITY.md.

## 2026-06-18 .. 2026-06-24

### Added
- Add new region to Germany states geo data.
- Add new documentation files for async, colors, strings, utils, and hdri-dashboard packages.

### Changed
- Reformat code and documentation across all apps, packages, and scripts for consistency and improved readability, including markdown prompts, configuration files, and TypeScript modules.

### Fixed
- Fix minor typos and update region data in Germany states geo JSON.
- Correct minor errors in prompts and component rendering.

### Removed
- Remove deprecated and duplicate markdown pipeline definition files.

### Security
- Update dependencies in package.json files to address potential vulnerabilities.

### Documentation
- Update and reformat multiple README, RUNBOOK, and markdown documentation files for improved clarity and consistency.

## 2026-06-11 .. 2026-06-17

### Added
- Update dependencies to latest versions, including better-sqlite3, csv-stringify, csv-parse, vitest, and @cloudflare/workers-types, across all relevant packages.

### Changed
- Upgrade csv-parse major version to 7.0.0, ensuring compatibility and benefiting from upstream improvements.

### Fixed
- Address potential issues by aligning all project and package dependencies to recent releases.

## 2026-06-04 .. 2026-06-10

### Added
- Update dependencies across all workspace packages, including @types/node, tsx, vitest, astro, @astrojs/cloudflare, wrangler, @anthropic-ai/sdk, openai, @google/genai, tldts, and @duckdb/node-api, to their latest versions for improved compatibility and stability.

### Changed
- Bump multiple core and application dependencies to enhance security, performance, and maintainability.

### Fixed
- Resolve potential issues caused by outdated dependencies in all packages.

## 2026-05-21 .. 2026-05-27

### Added
- Add gewerk_group field to asset_states and cohort_members, enabling industry grouping and aggregation by gewerk_group alongside Destatis strata.

### Changed
- Update multiple dependencies including @types/node, tsx, vitest, astro, @anthropic-ai/sdk, @google/genai, openai, and tldts; alphabetize digital-observatory workspace imports.
- Enhance AXE-signal ontology and contract ontology pipeline to better support AXE-signal modeling and integration in observatory-core.

### Fixed
- Correct and expand signal mapping and associated tests in observatory-core for improved signal handling.

## 2026-05-14 .. 2026-05-20

### Added
- Add asset state ingestion with SCD-2 temporal tracking and asset_hwo_mappings to SyncFromFactoryGogol and EmitBundleGogol.

### Changed
- Normalize period format to lowercase 'q' (e.g., '2025-q2') across observatory code, including regex updates, brief templates, input normalization, and test fixtures.
- Replace manual period parsing with parsePeriod() helper in all relevant gogols, improving consistency and reducing duplicate code.
- Refactor all hdri-factory apps to use shared factory utilities from observatory-core, replacing duplicated path logic.

### Fixed
- Fix IngestAssetStates to implement SCD-2 correctly by expiring previous asset_states rows before inserting new versions.
- Remove provenance mismatch warnings from ScoreHdri.

## 2026-05-07 .. 2026-05-13

### Added
- Add support for ontology schemas and validation in observatory-core.
- Introduce new extraction, audit, and contract ontology pipelines to hdri-factory.
- Document new pipeline phases and data flows in the digital-observatory and hdri-factory apps.
- Implement device ID setup script and support for new crypto device-related APIs.
- Add business registration and contract ontology-related packages and configs.

### Changed
- Upgrade multiple dependencies and update pnpm-lock.yaml for compatibility.
- Improve scoring and classification algorithms for HDI datasets.
- Refactor pipeline and data output organization, consolidating and renaming several directories in hdri-factory app.
- Update and streamline bootstrap and configuration files across pipelines.
- Enhance cookie banner extraction logic and ontology fixture definitions.

### Fixed
- Address issues in signal mapping and observation builder tests.
- Resolve minor inconsistencies in documentation and type definitions across core packages.

### Removed
- Remove obsolete data batches, logs, and duplicate step guides from HDI factory output directories.
- Deprecate legacy self-report intake sub-app with all associated sources and configuration.

### Security
- Improve crypto device handling for enhanced secure signing in observatory-crypto.

### Documentation
- Expand and clarify codebook and ontology documentation in digital-observatory.
- Add and revise readme files and runbooks for new and updated apps and pipelines.
