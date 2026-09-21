# Changelog

All notable changes to the `observatory-vault` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add generated AGENTS.md files for all apps and packages.
- Add new changelog files for multiple apps and packages.
- Add population frame contract and related release tool for HDRI.
- Add tests and documentation for HDRI release boundary and frame import.
- Add disaster recovery support for HDRI vault stream.

### Changed
- Bump dependencies including typescript, eslint, Playwright, OpenAI, jsdom, @warpgogol/forge, cross-env, turbo, jose, tsx, csv-parse, undici, and verdaccio.
- Rename @wgogol/changelog-live to @warpgogol/changelog-live for consistency.
- Migrate forge from @webgogol/forge@0.3.0 to @warpgogol/forge@0.7.0.
- Update RFC files and release workflow documentation.
- Regenerate AGENTS.md files as per RFC-0070 step 16.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 for compatibility with typescript-eslint.
- Expose parquet writer in observatory-vault for HDRI archive indexing.
- Restore legacy HDRI vaults without state shards.

### Removed
- Remove unused legacy data from population frame and changelog files.

### Documentation
- Update RFCs and audits for HDRI to reflect latest schema and release info.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across the monorepo.
- Add README file to repository.

### Changed
- Upgrade dependencies in all workspace packages and apps.
- Align vitest versions across packages.
- Refactor observatory core to consolidate EXT_SIGNAL_MAP into SIGNAL_MAP_DATA.

### Fixed
- Fix dependency issues by restoring missing package.json files.

### Removed
- Remove code-compass from all package.json devDependencies and scripts across the monorepo.
- Remove deprecated per-kind write wrappers from observatory-vault package.
- Flatten project structure by moving apps/source/* to root and removing obsolete source files.

### Documentation
- Merge AGENTS.md changes and add documentation updates.

## 2026-07-09 .. 2026-07-15

### Added
- Add eslint and typescript-eslint to devDependencies in all apps and packages for improved linting consistency.
- Add @org/source resolve conditions to all relevant Vitest configurations to ensure correct module resolution.

### Changed
- Rename all monorepo packages and references from @org to @syrokomskyi scope for unified package naming.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass across the codebase and update all references.
- Upgrade dependencies and normalize package.json formatting across all apps and packages for consistency.
- Update major and minor dependencies across all apps and packages, including astro, tsx, typescript-eslint, and others.

### Fixed
- Fix type error in manifest.test.ts by correcting VaultManifest to VaultManifestData in observatory-vault.
- Ensure eslint is invoked directly via node in all packages and apps to support diverse environments.
- Fix build output for export scripts by emitting tsconfig.json to produce correct dist/ folders.
- Resolve all Vitest configuration issues by consistently adding necessary module conditions.

### Removed
- Remove legacy package name references and redundant config formatting throughout the monorepo.

### Documentation
- Update pipeline and agent documentation to reflect new package scopes and recent refactoring.
- Reformat project and agent documentation files for clarity and consistency.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS scaffolding and commands to all workspace packages, enabling root-level COMPASS commands and utility scripts.

### Changed
- Rename @org/compass-checks to @wgogol/compass and migrate code to packages/compass.
- Rename @wgogol/compass to @wgogol/code-compass across all packages to reflect updated naming conventions.
- Apply Prettier formatting to digital-observatory, city, and architecture manifest to maintain code consistency.

### Fixed
- Increase testTimeout to 15 seconds for observatory-vault manifest tests to address I/O-heavy operations on Windows.

### Removed
- Remove deprecated compass-checks, compass-codegen, and compass-core packages after migration to @wgogol/compass.

## 2026-06-25 .. 2026-07-01

### Added
- Add business lifecycle event model to the observatory core.
- Introduce cross-year stable asset identity registry for consistent asset identification.
- Implement vault shard manifest with planned verification and CI gate integration.
- Add rebuild-from-vault functionality and round-trip invariant testing.

### Changed
- Enforce mechanical shard immutability in the vault by preventing overwrites and ensuring read-only access.

## 2026-06-18 .. 2026-06-24

### Added
- Add new states to Germany map data in hdri-dashboard.

### Changed
- Reformat codebase for consistent style across all apps and packages.
- Update @types/node to ^26.0.0 and Astro to ^6.4.8 across all projects.
- Update AI SDK packages in the monorepo for improved compatibility.

### Fixed
- Correct minor typographical inconsistencies in documentation and code comments.

### Removed
- Remove deprecated legal document generators and obsolete source records.

### Security
- Apply dependency updates addressing known vulnerabilities in dependencies.

### Documentation
- Update and reformat various README and agent/rule markdown files for clarity.

## 2026-06-11 .. 2026-06-17

### Changed
- Update dependencies to latest versions for improved stability and features, including better-sqlite3, csv-stringify, csv-parse, vitest, and @cloudflare/workers-types.

## 2026-06-04 .. 2026-06-10

### Added
- Update dependencies across all workspace packages, including @types/node 25.9.2, tsx 4.22.4, vitest 4.1.8, astro 6.4.4, @astrojs/cloudflare 13.6.1, wrangler 4.98.0, @anthropic-ai/sdk 0.102.0, openai 6.42.0, @google/genai 2.8.0, tldts 7.4.2, and @duckdb/node-api 1.5.3-r.3 for improved stability and compatibility.

### Changed
- Bump dependency versions in all workspace package manifests and lockfile to ensure latest features and security updates.

### Fixed
- Address minor compatibility issues by updating to the latest dependency versions.

## 2026-05-21 .. 2026-05-27

### Added
- Add support for streaming NDJSON writes in writeParquet to handle large datasets and prevent memory overflow errors.

### Changed
- Upgrade multiple dependencies across all project packages, including @anthropic-ai/sdk, @astrojs/cloudflare, astro, @duckdb/node-api, @quantco/pnpm-licenses, wrangler, @types/node, tsx, vitest, @google/genai, openai, and tldts.
- Alphabetize digital-observatory workspace imports for improved maintainability.

### Fixed
- Fix RangeError in writeParquet by replacing in-memory string concatenation with streaming file writes.

## 2026-05-07 .. 2026-05-13

### Added
- Add source files, test infrastructure, and path utilities to observatory-crypto and observatory-vault packages.

### Changed
- Upgrade dependencies across all packages; update @google/genai to 2.0.1, ai to 6.0.177, semver to 7.8.0, and pin @duckdb/node-api to 1.5.2-r.1.

### Fixed
- Update pnpm lockfile to reflect latest dependency versions and additions.

### Removed
- Reduce unused lines from pnpm-lock.yaml as part of cleanup.

### Security
- Ensure dependencies are up-to-date to incorporate latest security patches.

### Documentation
- Add package files and tsconfigs for improved project setup documentation.
