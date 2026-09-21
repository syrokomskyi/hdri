# Changelog

All notable changes to the `observatory-emit` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add AGENTS.md documentation across all packages and apps.
- Add comprehensive CHANGELOG.md files for all packages and apps.

### Changed
- Rename @wgogol/changelog-live to @warpgogol/changelog-live across the monorepo.
- Migrate forge dependency from @webgogol/forge@0.3.0 to @warpgogol/forge@0.7.0 in all relevant packages.
- Bump dependencies including TypeScript (then downgrade for compatibility), eslint, jose, tsx, typescript-eslint, commander, openai, @anthropic-ai/sdk, jsdom, @tanstack/table-core, @swc/core, @swc/helpers, @swc-node/register, @warpgogol/forge, cross-env, jiti, turbo, csv-parse/stringify, undici, verdaccio across packages and apps.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to restore compatibility with typescript-eslint.

### Removed
- Remove old forge dependency from @webgogol/forge and references to previous changelog-live naming.

### Documentation
- Update and expand RFCs, example briefs, and learned principles throughout technical documentation.

## 2026-07-23 .. 2026-07-29

### Added
- Add missing package.json files across all apps, packages, and services.
- Add README.md and project narrative documentation to the repository.

### Changed
- Upgrade dependencies across the workspace packages and applications.
- Align all vitest versions for consistent testing across the monorepo.
- Refactor project structure by moving all content from apps/source/* to the root directory.

### Fixed
- Restore previously missing package.json files in multiple locations.

### Removed
- Remove code-compass from all package.json devDependencies and scripts.
- Delete obsolete files and folders associated with the old apps/source/ directory.

### Documentation
- Merge AGENTS.md documentation and update domain and triage agent docs.

## 2026-07-09 .. 2026-07-15

### Added
- Add @eslint/js and typescript-eslint to devDependencies for improved linting consistency.
- Add eslint as devDependency to all packages and apps.
- Add @org/source resolve condition to all Vitest configs.

### Changed
- Rename @org scope to @syrokomskyi across the entire monorepo for consistent package naming.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass for clarity.
- Refactor: Rename hdri-factory to factory, digital-observatory to observatory, and hdri-dashboard to dashboard for improved clarity and consistency.
- Unify SignSource and VerifyUpstream functionality into pipeline-steps base classes.
- Upgrade and normalize dependencies and package.json formatting across all apps and packages.

### Fixed
- Fix usage of the eslint binary by invoking it directly via node in all packages and apps.

### Removed
- Remove redundant dependency declaration from observatory-emit.

### Documentation
- Reformat various documentation files for clarity and consistency.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS scaffolding and commands to multiple packages, enabling standardized COMPASS usage and root-level commands.
- Introduce new property-based round-trip tests for the observatory-emit module.

### Changed
- Rename @org/compass-checks to @wgogol/compass and refactor @wgogol/compass to @wgogol/code-compass, updating all references and dependencies accordingly.
- Apply prettier formatting across digital-observatory, city, and architecture manifest files for improved code consistency.

### Fixed
- Remove forbidden code blocks from packages and scripts to align with grace requirements.

### Removed
- Deprecate and remove compass-checks, compass-codegen, and compass-core packages.

## 2026-06-25 .. 2026-07-01

### Added
- Enforce the factory↔observatory contract at runtime in observatory-emit, including related tests and schema updates.

### Changed
- Update CI workflow and package dependencies to support new contract enforcement.

### Fixed
- Correct contract handling in reader implementation.

## 2026-06-18 .. 2026-06-24

### Added
- Add localize-concept-image prompt and new README files for async, colors, and utils packages.
- Add new Germany state data to hdri-dashboard assets.

### Changed
- Reformat codebase for consistent code style and formatting across all workspace applications, libraries, and documentation.
- Update most prompts, configuration files, and styles to adhere to a unified formatting standard.

### Fixed
- Fix minor issues in test files and documentation by correcting typos and normalizing formatting.

### Removed
- Remove deprecated documentation for obsolete gogols and pipeline phases.

## 2026-06-11 .. 2026-06-17

### Added
- Update dependencies to latest versions, including better-sqlite3, csv-stringify, csv-parse, vitest, and @cloudflare/workers-types, to improve stability and compatibility.

### Changed
- Upgrade csv-parse to version 7.0.0, introducing potential minor interface changes and enhancements.

### Fixed
- Resolve issues related to outdated dependency versions across multiple packages.

## 2026-06-04 .. 2026-06-10

### Added
- Update dependencies across all workspace packages, including @types/node, tsx, vitest, astro, @astrojs/cloudflare, wrangler, @anthropic-ai/sdk, openai, @google/genai, tldts, and @duckdb/node-api.

### Changed
- Bump multiple major and minor package versions for improved stability and new features.

### Fixed
- Resolve potential bugs and compatibility issues by upgrading dependencies.

## 2026-05-21 .. 2026-05-27

### Added
- Add manifest.emit_dir type definition to support improved data file resolution.

### Changed
- Update dependencies across apps and packages to the latest versions and alphabetize workspace imports in digital-observatory.

### Fixed
- Fix auto-discovery to correctly locate manifest.json at the .output/<DEVICE_ID>/ level for data resolution.

### Documentation
- Update brief documentation for digital-observatory input.

## 2026-05-14 .. 2026-05-20

### Added
- Introduce asset state ingestion to SyncFromFactoryGogol and EmitBundleGogol, including streamAssetStates() for ndjson ingestion and SCD-2 temporal tracking in asset_states.
- Add asset_hwo_mappings table inserts for classification code support.
- Extend EmitBundleGogol to harvest asset states from core\_\*.db files via readAssetStates().

### Changed
- Update multiple dependencies across all packages, including @types/node, tsx, @anthropic-ai/sdk, @google/genai, @types/jsdom, openai, @ai-sdk/anthropic, @ai-sdk/openai, ai, vite, and markdown-table.
- Normalize workspace dependency order in several package.json files.
- Refactor SignSourceGogol and VerifyUpstreamGogol to use centralized reporting utilities from @org/observatory-emit, consolidating signature and verification logic.

### Fixed
- Implement expireOld() helper to properly close previous records in asset_states with valid_from/valid_to tracking.

### Removed
- Extract renderKeyValueMd and findManifestPath utilities to a shared package, eliminating redundancy.

## 2026-05-07 .. 2026-05-13

### Added
- Add new configuration, documentation, and environment example files to improve developer setup and onboarding.
- Add several new packages and modules, including 'observatory-emit', support for contract ontology in 'hdri-factory', and new entry points and configurations in various submodules.

### Changed
- Upgrade dependencies and update multiple package.json files to maintain compatibility and improve overall project stability.
- Refactor several configuration and main script files for pipeline apps to streamline development workflows.

### Fixed
- Update type definitions and test cases to improve type safety and correctness across observatory-related packages.

### Removed
- Remove the 'a-score-hdri' and 'b-pub-hdri' pipelines, related scripts, types, configs, documentation, and associated batch data to clean up unused code.

### Security
- Enhance device identification and cryptographic utilities for improved security in observatory-crypto.

### Documentation
- Update and clean up multiple README and pipeline documentation files to reflect recent structural changes and removals.
