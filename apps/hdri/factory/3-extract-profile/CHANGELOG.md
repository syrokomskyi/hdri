# Changelog

All notable changes to the `3-extract-profile` project are documented here.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across multiple apps and packages to resolve build issues
- Add README.md to provide project overview and instructions

### Changed
- Upgrade dependencies across the workspace to latest versions for improved stability
- Align all vitest versions in package.json for consistent testing

### Fixed
- Merge changes from AGENTS.md into the root file to resolve documentation split

### Removed
- Remove code-compass from all package.json devDependencies and scripts
- Flatten project structure by moving apps/source/* to the project root, deleting legacy files and redundant source folders

### Documentation
- Update project narrative and documentation to reflect structural changes and dependency updates
