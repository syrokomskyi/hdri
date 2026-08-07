# Changelog

All notable changes to the `rate-limit` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Generate CHANGELOG.md for all packages and apps to track version history.
- Add changelog links to all README.md files for improved navigation.
- Add AGENTS.md documentation across all apps and packages.

### Changed
- Migrate forge from @webgogol/forge to @warpgogol/forge for unified tooling.
- Rename @wgogol/changelog-live to @warpgogol/changelog-live throughout the project.
- Upgrade TypeScript and various dependencies to latest versions for improved stability and features.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to ensure compatibility with typescript-eslint.

### Removed
- Remove outdated references to deprecated forge packages.

### Security
- Update dependencies, including @swc/core and jsdom, to resolve potential security vulnerabilities.

### Documentation
- Update documentation and skills to reflect changes from dependency and package renames.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files in multiple packages and add a workspace README for improved project setup.

### Changed
- Upgrade dependencies across all workspace packages for improved stability and compatibility.
- Align vitest versions across packages for consistent testing.
- Flatten project structure by moving contents of apps/source/* to the repository root.
- Update documentation inventory and configuration files to match the flattened project structure.

### Fixed
- Fix and harden the controlled acquisition pipeline in the news generator, resolving various data handling and pipeline logic issues.
- Keep queued work alive in the rate-limit token bucket implementation to ensure reliability.
- Restore and update AGENTS.md to merge recent changes.

### Removed
- Remove code-compass from all package.json devDependencies, scripts, and configuration files.
- Remove obsolete and source directory files following project structure flattening.

### Documentation
- Add README.md to the root of the repository.
- Merge AGENTS.md content and update references throughout documentation.

## 2026-07-09 .. 2026-07-15

### Added
- Add unified Clock seam and observability features to the rate-limit package.
- Add documentation for unified Clock seam, observability, and NonRetryableError in rate-limit README.
- Add @org/source resolve conditions to all package vitest configurations to improve test resolution.

### Changed
- Rename all internal package scopes from @org and @wgogol to @syrokomskyi across the entire monorepo.
- Update all dependencies across monorepo packages to the latest versions.

### Fixed
- Fix retry-breaker composition and improve code reliability for the rate-limit package.

### Removed
- Remove obsolete device ID setup script.

### Documentation
- Reformat and update documentation for improved consistency and clarity.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS scaffolding and enable annotate command across packages to standardize configuration and code generation.
- Introduce COMPASS support to all workspace packages and enable root-level COMPASS commands.
- Add property-based tests for TokenBucket in the rate-limit package.

### Changed
- Rename @org/compass-checks to @wgogol/compass and update all references by consolidating, removing, and migrating redundant compass-related packages.
- Rename @wgogol/compass to @wgogol/code-compass and update all associated import references across the monorepo.
- Apply Prettier formatting across digital-observatory, city, and architecture manifest projects for consistent code style.

### Fixed
- Extract shared rate limit runtime to a dedicated package and update dependent packages to use the new implementation.

### Removed
- Remove deprecated compass-checks, compass-codegen, and compass-core packages after migration to consolidated compass package.
