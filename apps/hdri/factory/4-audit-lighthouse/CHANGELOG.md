# Changelog

All notable changes to the `4-audit-lighthouse` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add changelog links to all README.md files for packages and apps.
- Generate CHANGELOG.md files for all packages and apps.
- Add changelog.config.yaml and changelog-live devDependency to all previously missing packages and apps.

### Changed
- Regenerate AGENTS.md files as required by RFC-0070 step 16.

### Fixed
- Exclude test files from HDRI factory app TypeScript configurations.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files for various apps and packages
- Align vitest versions across the workspace for consistency
- Add merged AGENTS.md and new README.md for documentation

### Changed
- Upgrade dependencies across the workspace to latest versions

### Fixed
- Eliminate all pnpm install warnings across projects

### Removed
- Remove code-compass from all package.json devDependencies and scripts
- Remove source/ directory by flattening project structure and moving apps to root

### Documentation
- Update and merge documentation files; add README.md and revise AGENTS.md
