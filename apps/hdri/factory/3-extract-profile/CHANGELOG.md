# Changelog

All notable changes to the `3-extract-profile` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add changelog links to all README.md files across apps and packages.
- Generate CHANGELOG.md files for all packages and apps to provide clear version history.
- Add changelog.config.yaml and changelog-live as a development dependency to all missing packages and apps for standardized changelog management.

### Changed
- Regenerate AGENTS.md files for all apps and packages in alignment with RFC-0070 step 16.

### Fixed
- Exclude test files from HDRI factory app TypeScript configs to prevent build interference.

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
