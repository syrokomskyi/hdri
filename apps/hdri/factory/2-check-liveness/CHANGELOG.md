# Changelog

All notable changes to the `2-check-liveness` project are documented here.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files and add new README.md.

### Changed
- Upgrade dependencies across all workspace packages to latest versions.
- Align all Vitest versions for consistency across the monorepo.
- Flatten project structure by moving apps/source/* to the root directory.

### Fixed
- Restore missing metadata and configuration after project restructure.

### Removed
- Remove code-compass from all package.json devDependencies and scripts.
- Remove obsolete files and documentation from apps/source in favor of root structure.

### Documentation
- Merge AGENTS.md into the main documentation and update README.md content.
