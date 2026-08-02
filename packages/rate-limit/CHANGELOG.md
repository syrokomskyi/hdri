# Changelog

All notable changes to the `rate-limit` project are documented here.

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
